//
//  TerminalFileStaging.swift
//  libghostty-spm
//

import Foundation
import UniformTypeIdentifiers

/// Files the terminal writes on the host's behalf so a program gets a path
/// it can open: image or document data pasted with no path of its own, and
/// anything dropped on the view. The pasteboard and drop readers hand it
/// item providers or bytes; it hands back shell-escaped paths, space-joined,
/// ready for the text path.
///
/// Lifetime: a staged file belongs to the shell that received its path, and
/// nothing here can know when that shell is done with it. So a file stays
/// until ``staleFileAge`` has passed — swept whenever a new one is written,
/// or on ``removeStaleFiles()`` — and a host that knows nothing can refer to
/// them any more (its last session ended, the app is quitting together with
/// its shells) calls ``removeAllFiles()``.
public enum TerminalFileStaging {
    /// Where staged files go. Defaults to a `ghostty-paste` folder in the
    /// app's temporary directory; a host whose shell cannot read the app
    /// container points it somewhere both can reach, before the first paste
    /// or drop.
    @MainActor
    public static var directory = FileManager.default.temporaryDirectory
        .appendingPathComponent("ghostty-paste", isDirectory: true)

    /// How long a staged file stays: 24 hours by default. The clipboard and
    /// the drop forget it long before that; the shell that got its path may
    /// still be typing it.
    @MainActor
    public static var staleFileAge: TimeInterval = 24 * 60 * 60

    /// A provider and the type it will be asked for. `NSItemProvider` is
    /// thread-safe by contract but not marked so; its own load completion
    /// is the only place it travels to.
    struct Item: @unchecked Sendable {
        let provider: NSItemProvider
        let type: UTType
    }

    /// One slot per staged item, filled by whichever load completion runs.
    /// A reference type because the completions run concurrently and share
    /// it; the lock is what makes the sharing safe.
    private final class Paths: @unchecked Sendable {
        private let lock = NSLock()
        private var values: [String?]

        init(count: Int) {
            values = .init(repeating: nil, count: count)
        }

        func set(_ path: String?, at index: Int) {
            lock.lock()
            values[index] = path
            lock.unlock()
        }

        var resolved: [String] {
            lock.lock()
            defer { lock.unlock() }
            return values.compactMap(\.self)
        }
    }

    // MARK: - Cleanup

    /// Removes staged files older than ``staleFileAge``. Cheap when the
    /// directory does not exist.
    @MainActor
    public static func removeStaleFiles() {
        sweep(directory, olderThan: staleFileAge)
    }

    /// Removes every staged file. For the moment the host knows no shell
    /// can still refer to one: its last session ended, or the app is
    /// quitting and taking its shells with it.
    @MainActor
    public static func removeAllFiles() {
        do {
            try FileManager.default.removeItem(at: directory)
        } catch CocoaError.fileNoSuchFile {
        } catch {
            TerminalDebugLog.log(.input, "staged files not removed: \(error)")
        }
    }

    // MARK: - Staging

    /// Writes every provider's file representation under ``directory`` and
    /// completes on the main queue with the escaped, space-joined paths, or
    /// `nil` when none could be written. Every load is requested before this
    /// returns — a drop session's providers only answer within the
    /// `performDrop` call that handed them over — and the copying happens
    /// in each load's completion, off the main thread.
    @MainActor
    static func stage(
        _ items: [Item],
        completion: @escaping @MainActor (String?) -> Void,
    ) {
        let directory = directory
        guard prepareDirectory(directory, staleAge: staleFileAge) else {
            completion(nil)
            return
        }
        let group = DispatchGroup()
        let paths = Paths(count: items.count)
        for (index, item) in items.enumerated() {
            group.enter()
            // The representation is deleted when the completion
            // returns, so it is copied out before then.
            item.provider.loadFileRepresentation(forTypeIdentifier: item.type.identifier) { url, error in
                defer { group.leave() }
                guard let url else {
                    TerminalDebugLog.log(
                        .input,
                        "staging file representation failed type=\(item.type.identifier) error=\(String(describing: error))",
                    )
                    return
                }
                let (name, fileExtension) = fileName(suggested: item.provider.suggestedName, type: item.type)
                let path = store(name: name, extension: fileExtension, in: directory) {
                    try FileManager.default.copyItem(at: url, to: $0)
                }
                paths.set(path, at: index)
            }
        }
        // `@Sendable` keeps the block off the main actor; formed here it
        // would otherwise inherit `stage`'s isolation and trap on the
        // global queue.
        group.notify(queue: .global(qos: .userInitiated)) { @Sendable in
            let resolved = paths.resolved
            TerminalDebugLog.log(.input, "staged \(resolved.count)/\(items.count) file(s)")
            terminalRunOnMain {
                completion(resolved.isEmpty ? nil : resolved.map(TerminalShellEscape.escape).joined(separator: " "))
            }
        }
    }

    /// Writes raw bytes as one staged file named for `type` and completes on
    /// the main queue with its escaped path, or `nil` when the write failed.
    @MainActor
    static func stage(
        data: Data,
        name: String,
        type: UTType,
        completion: @escaping @MainActor (String?) -> Void,
    ) {
        let directory = directory
        let staleAge = staleFileAge
        DispatchQueue.global(qos: .userInitiated).async {
            guard prepareDirectory(directory, staleAge: staleAge) else {
                terminalRunOnMain { completion(nil) }
                return
            }
            let path = store(name: name, extension: type.preferredFilenameExtension ?? "bin", in: directory) {
                try data.write(to: $0, options: .atomic)
            }
            terminalRunOnMain { completion(path.map(TerminalShellEscape.escape)) }
        }
    }

    // MARK: - Rules

    /// The type worth a file among what one item offers, or `nil` when it
    /// carries text, a link, or a folder. Images win over anything else the
    /// same item registers (a copied photo also registers its URL); text
    /// wins over the rest, since a rich-text or web selection also registers
    /// data types (`com.apple.flat-rtfd`, `com.apple.webarchive`) that are
    /// not text themselves.
    static func fileType(among identifiers: [String]) -> UTType? {
        let types = identifiers.compactMap(UTType.init)
        if let image = types.first(where: { $0.conforms(to: .image) }) {
            return image
        }
        if types.contains(where: { $0.conforms(to: .text) }) {
            return nil
        }
        // Dynamic types (`dyn.a…`) are pasteboard bookkeeping.
        return types.first { type in
            !type.isDynamic
                && type.conforms(to: .data)
                && !type.conforms(to: .text)
                && !type.conforms(to: .url)
        }
    }

    /// The file name a staged item gets: its own when the provider carries
    /// one, else `image`/`file`, always with the type's preferred extension
    /// unless the name brought its own.
    static func fileName(suggested: String?, type: UTType) -> (name: String, extension: String) {
        let preferred = type.preferredFilenameExtension ?? "bin"
        guard let suggested = suggested.map({ $0 as NSString }), suggested.length > 0 else {
            return (type.conforms(to: .image) ? "image" : "file", preferred)
        }
        let existing = suggested.pathExtension
        return (
            existing.isEmpty ? suggested as String : suggested.deletingPathExtension,
            existing.isEmpty ? preferred : existing,
        )
    }

    /// A path under `directory` that no earlier file took: the name, the
    /// time in seconds, and a counter only when two share both. The name
    /// loses path separators and control characters — the shell escape
    /// covers everything else.
    static func uniqueURL(name: String, extension fileExtension: String, in directory: URL) -> URL {
        let safeName = String(
            name.map { $0 == "/" || $0.isNewline || $0.asciiValue.map { $0 < 0x20 } == true ? "_" : $0 },
        )
        let stamp = Int(Date().timeIntervalSince1970)
        var candidate = directory.appendingPathComponent("\(safeName)-\(stamp).\(fileExtension)")
        var counter = 1
        while FileManager.default.fileExists(atPath: candidate.path) {
            candidate = directory.appendingPathComponent("\(safeName)-\(stamp)-\(counter).\(fileExtension)")
            counter += 1
        }
        return candidate
    }

    /// Serialises name choice and write: provider completions arrive on
    /// concurrent queues, and two items with the same name would otherwise
    /// be handed the same path.
    private static let storeLock = NSLock()

    /// Writes one item into `directory` — prepared by the caller, once per
    /// paste or drop — readable by whoever can reach the directory, and
    /// returns its path, or `nil` when the write fails.
    static func store(
        name: String,
        extension fileExtension: String,
        in directory: URL,
        write: (URL) throws -> Void,
    ) -> String? {
        storeLock.lock()
        defer { storeLock.unlock() }
        let destination = uniqueURL(name: name, extension: fileExtension, in: directory)
        do {
            try write(destination)
            // A copied representation keeps the provider's mode and an
            // atomic write follows the umask; the shell that opens the
            // file may not be the app's user. The copy also keeps the
            // source's modification date, which the sweep would read as
            // age, so the file is stamped with the time its path was
            // handed out.
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o644, .modificationDate: Date()],
                ofItemAtPath: destination.path,
            )
            return destination.path
        } catch {
            TerminalDebugLog.log(.input, "staged file write failed: \(error)")
            return nil
        }
    }

    /// Creates the staging directory, readable by anyone who can reach it
    /// (the shell may not be the app's own user), and sweeps what is stale.
    /// Once per paste or drop, before any file is written.
    static func prepareDirectory(_ directory: URL, staleAge: TimeInterval) -> Bool {
        do {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o755],
            )
        } catch {
            TerminalDebugLog.log(.input, "staging directory unavailable: \(error)")
            return false
        }
        sweep(directory, olderThan: staleAge)
        return true
    }

    /// Removes the files in `directory` whose modification date is older
    /// than `age`. Nothing to do when the directory does not exist.
    static func sweep(_ directory: URL, olderThan age: TimeInterval) {
        let manager = FileManager.default
        let cutoff = Date().addingTimeInterval(-age)
        let contents = (try? manager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey],
        )) ?? []
        for url in contents {
            let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?
                .contentModificationDate ?? .distantPast
            if modified < cutoff {
                try? manager.removeItem(at: url)
            }
        }
    }
}
