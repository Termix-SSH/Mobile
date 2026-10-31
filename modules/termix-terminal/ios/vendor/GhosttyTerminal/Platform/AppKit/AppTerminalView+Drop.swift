//
//  AppTerminalView+Drop.swift
//  libghostty-spm
//

#if !canImport(UIKit) && canImport(AppKit)
    import AppKit
    import UniformTypeIdentifiers

    /// Drop state; behavior lives in +Drop.
    struct DropState {
        var acceptsFiles = true
    }

    /// Drag and drop onto the terminal, the AppKit twin of
    /// `UITerminalView+Drop`.
    ///
    /// Files from Finder paste as their shell-escaped paths, space-joined
    /// (``TerminalPasteboardContent`` reads them the way a paste does). Image
    /// data with no file of its own — an image dragged out of a browser — is
    /// written through ``TerminalFileStaging`` first and pastes as that path.
    /// A link or text pastes as text. Everything a drop delivers travels the
    /// text path, like a paste: a program with bracketed paste on gets one
    /// paste it can tell from typing, never keystrokes.
    ///
    /// A host whose shell runs on another machine turns file drops off with
    /// ``acceptsFileDrops``: a path on this Mac means nothing there. Links and
    /// text still drop.
    extension AppTerminalView {
        static let dropTypes: [NSPasteboard.PasteboardType] = [.fileURL, .URL, .string] + imageDropTypes

        /// Encoded images taken as they are, in this order; TIFF (what AppKit
        /// drags carry) is converted to PNG.
        static let imageDropTypes: [NSPasteboard.PasteboardType] = [
            .png,
            NSPasteboard.PasteboardType(UTType.jpeg.identifier),
            NSPasteboard.PasteboardType(UTType.gif.identifier),
            NSPasteboard.PasteboardType(UTType.webP.identifier),
            .tiff,
        ]

        /// Whether files (paths, staged images) drop here; true by default.
        public var acceptsFileDrops: Bool {
            get { drop.acceptsFiles }
            set { drop.acceptsFiles = newValue }
        }

        /// What a drop of `pasteboard` delivers, decided without reading
        /// image data.
        enum DropPayload: Equatable {
            case text(String)
            case image(NSPasteboard.PasteboardType)
        }

        func setupDropInput() {
            registerForDraggedTypes(Self.dropTypes)
        }

        func dropPayload(from pasteboard: NSPasteboard) -> DropPayload? {
            let files = (pasteboard.readObjects(
                forClasses: [NSURL.self],
                options: [.urlReadingFileURLsOnly: true],
            ) as? [URL]) ?? []
            if !files.isEmpty {
                guard drop.acceptsFiles else { return nil }
                return TerminalPasteboardContent.text(string: nil, urls: files).map(DropPayload.text)
            }
            // A browser's image also carries its web address; the picture
            // wins, as on UIKit, unless files can't land here.
            if drop.acceptsFiles, let type = pasteboard.availableType(from: Self.imageDropTypes) {
                return .image(type)
            }
            let urls = (pasteboard.readObjects(forClasses: [NSURL.self]) as? [URL]) ?? []
            return TerminalPasteboardContent.text(
                string: pasteboard.string(forType: .string),
                urls: urls,
            ).map(DropPayload.text)
        }

        override open func draggingEntered(_ sender: any NSDraggingInfo) -> NSDragOperation {
            dropPayload(from: sender.draggingPasteboard) == nil ? [] : .copy
        }

        override open func draggingUpdated(_ sender: any NSDraggingInfo) -> NSDragOperation {
            dropPayload(from: sender.draggingPasteboard) == nil ? [] : .copy
        }

        override open func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
            let pasteboard = sender.draggingPasteboard
            switch dropPayload(from: pasteboard) {
            case let .text(text):
                TerminalDebugLog.log(.input, "drop text bytes=\(text.utf8.count)")
                return surface?.paste(text: text) ?? false
            case let .image(type):
                guard let (data, utType) = Self.encodedImage(in: pasteboard, type: type) else { return false }
                TerminalFileStaging.stage(data: data, name: "image", type: utType) { [weak self] path in
                    guard let self, let path else {
                        TerminalDebugLog.log(.input, "drop skipped: the image could not be staged")
                        return
                    }
                    TerminalDebugLog.log(.input, "drop image bytes=\(data.count)")
                    _ = surface?.paste(text: path)
                }
                return true
            case nil:
                return false
            }
        }

        static func encodedImage(
            in pasteboard: NSPasteboard,
            type: NSPasteboard.PasteboardType,
        ) -> (Data, UTType)? {
            guard let data = pasteboard.data(forType: type) else { return nil }
            guard type == .tiff else {
                return UTType(type.rawValue).map { (data, $0) }
            }
            guard let png = NSBitmapImageRep(data: data)?.representation(using: .png, properties: [:]) else {
                return nil
            }
            return (png, .png)
        }
    }
#endif
