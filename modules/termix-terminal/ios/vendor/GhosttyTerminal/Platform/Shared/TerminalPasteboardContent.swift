//
//  TerminalPasteboardContent.swift
//  libghostty-spm
//
//  Reference:
//  - ghostty-org/ghostty
//  - macos/Sources/Helpers/NSPasteboard+Extension.swift
//    (`getOpinionatedStringContents`: URLs first — file URLs paste as
//    escaped paths, others verbatim — then the string)
//

import Foundation
import UniformTypeIdentifiers

#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

/// What a paste hands the terminal, read off the general pasteboard the way
/// Ghostty's macOS app reads it: files as shell-escaped paths, text as-is.
///
/// Two readers, deliberately kept apart:
///
/// - ``text(from:)`` is what ghostty's `read_clipboard` callback uses. It
///   serves the paste binding *and* a program's OSC 52 read, so it has no
///   side effects and never touches the disk.
/// - ``files(from:completion:)`` (UIKit) is for a host-driven paste when the
///   pasteboard holds raw image or document data with no path at all — a
///   screenshot, a photo, a file copied out of Files. That data is staged as
///   a file first (``TerminalFileStaging``) so the paste lands as a path a
///   program can open; a program asking for "the clipboard" must never
///   trigger that write.
public enum TerminalPasteboardContent {
    /// Upstream's `getOpinionatedStringContents`, as the one rule every
    /// reader applies: URLs first — a file URL as its shell-escaped path,
    /// any other verbatim — then the string. The order matters: a file
    /// copied in Finder or Files carries both its URL and its display name
    /// as the string, and taking the string first pasted the name.
    static func text(string: String?, urls: [URL]) -> String? {
        if !urls.isEmpty {
            return urls
                .map { $0.isFileURL ? TerminalShellEscape.escape($0.path) : $0.absoluteString }
                .joined(separator: " ")
        }
        guard let string, !string.isEmpty else { return nil }
        return string
    }

    #if canImport(UIKit)
        /// Where pasted data with no path of its own is written. Forwards to
        /// ``TerminalFileStaging/directory``, which drops share.
        @MainActor
        public static var fileDirectory: URL {
            get { TerminalFileStaging.directory }
            set { TerminalFileStaging.directory = newValue }
        }

        /// Whether a paste would deliver anything — what ``text(from:)`` or
        /// ``files(from:completion:)`` would; the edit menu asks this on
        /// every validation, so it stays on cheap pasteboard queries.
        static func hasContent(_ pasteboard: UIPasteboard = .general) -> Bool {
            if pasteboard.hasStrings || pasteboard.hasURLs || pasteboard.hasImages {
                return true
            }
            if pasteboard.contains(pasteboardTypes: [UTType.fileURL.identifier]) {
                return true
            }
            return TerminalFileStaging.fileType(among: pasteboard.types) != nil
        }

        /// The pasteboard as text — see ``text(string:urls:)``. No side
        /// effects.
        static func text(from pasteboard: UIPasteboard = .general) -> String? {
            let general = pasteboard.hasURLs ? (pasteboard.urls ?? []) : []
            // `hasURLs`/`urls` cover `public.url`; a file copied in Finder
            // (Catalyst) or Files lands as `public.file-url`, which they do
            // not report, so that representation is read on its own.
            let files = general.contains(where: \.isFileURL) ? [] : fileURLs(in: pasteboard)
            let urls = files + general
            if !urls.isEmpty {
                TerminalDebugLog.log(.input, "paste resolved \(urls.count) url(s), \(files.count) file url(s)")
            }
            return text(string: pasteboard.hasStrings ? pasteboard.string : nil, urls: urls)
        }

        /// Whether ``text(from:)`` would find anything, asked through the
        /// pasteboard's detection API, which reads no contents (and so
        /// raises no paste prompt).
        static func hasText(in pasteboard: UIPasteboard = .general) -> Bool {
            pasteboard.hasStrings
                || pasteboard.hasURLs
                || pasteboard.contains(pasteboardTypes: [UTType.fileURL.identifier])
        }

        /// Every item's `public.file-url`, whatever form the pasteboard
        /// stored it in.
        static func fileURLs(in pasteboard: UIPasteboard) -> [URL] {
            pasteboard.items.compactMap { item -> URL? in
                guard let value = item[UTType.fileURL.identifier] else { return nil }
                if let url = value as? URL {
                    return url
                }
                if let data = value as? Data {
                    return URL(dataRepresentation: data, relativeTo: nil)
                }
                if let string = value as? String {
                    return URL(string: string)
                }
                return nil
            }
            .filter(\.isFileURL)
        }

        /// Image or document data on the pasteboard, staged under
        /// ``fileDirectory`` and returned as space-joined shell-escaped
        /// paths, or `nil` when there is none. Completes on the main queue.
        @MainActor
        static func files(
            from pasteboard: UIPasteboard = .general,
            completion: @escaping @MainActor (String?) -> Void,
        ) {
            let items = pasteboard.itemProviders.compactMap { provider in
                TerminalFileStaging.fileType(among: provider.registeredTypeIdentifiers)
                    .map { TerminalFileStaging.Item(provider: provider, type: $0) }
            }
            guard items.isEmpty else {
                TerminalFileStaging.stage(items, completion: completion)
                return
            }
            // A pasteboard that advertises an image without offering it
            // through an item provider: take the encoded bytes when it has
            // them, decode through `UIImage` only as a last resort.
            guard pasteboard.hasImages else {
                completion(nil)
                return
            }
            let encoded = [UTType.png, .jpeg, .heic].lazy
                .compactMap { type in
                    pasteboard.data(forPasteboardType: type.identifier).map { (data: $0, type: type) }
                }
                .first
            if let encoded {
                TerminalFileStaging.stage(data: encoded.data, name: "image", type: encoded.type, completion: completion)
            } else if let data = pasteboard.image?.pngData() {
                TerminalFileStaging.stage(data: data, name: "image", type: .png, completion: completion)
            } else {
                completion(nil)
            }
        }

    #elseif canImport(AppKit)
        /// The pasteboard as text — see ``text(string:urls:)``.
        static func text(from pasteboard: NSPasteboard = .general) -> String? {
            text(
                string: pasteboard.string(forType: .string),
                urls: (pasteboard.readObjects(forClasses: [NSURL.self]) as? [URL]) ?? [],
            )
        }

        /// Whether ``text(from:)`` would find anything, without reading it.
        static func hasText(in pasteboard: NSPasteboard = .general) -> Bool {
            pasteboard.availableType(from: [.string]) != nil
                || pasteboard.canReadObject(forClasses: [NSURL.self])
        }
    #endif
}
