//
//  UITerminalView+Drop.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit
    import UniformTypeIdentifiers

    /// Drag and drop onto the terminal, on iOS and Mac Catalyst alike.
    ///
    /// Files and images are copied into ``TerminalFileStaging/directory``
    /// and their shell-escaped paths are pasted — the drop's own
    /// representation is gone the moment the drop completes, and a shell
    /// that is not the app's user could not have read it anyway. A dropped
    /// folder, link, or text pastes as text: a folder is a path the shell
    /// can already reach. Everything a drop delivers travels the text path,
    /// like a paste; a path or a string is never keystrokes.
    extension UITerminalView: UIDropInteractionDelegate {
        func setupDropInput() {
            addInteraction(UIDropInteraction(delegate: self))
        }

        public func dropInteraction(_: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
            session.items.contains { item in
                TerminalFileStaging.fileType(among: item.itemProvider.registeredTypeIdentifiers) != nil
            }
                || session.canLoadObjects(ofClass: NSURL.self)
                || session.canLoadObjects(ofClass: NSString.self)
        }

        public func dropInteraction(_: UIDropInteraction, sessionDidUpdate _: any UIDropSession) -> UIDropProposal {
            UIDropProposal(operation: .copy)
        }

        public func dropInteraction(_: UIDropInteraction, performDrop session: any UIDropSession) {
            let files = session.items.compactMap { item in
                TerminalFileStaging.fileType(among: item.itemProvider.registeredTypeIdentifiers)
                    .map { TerminalFileStaging.Item(provider: item.itemProvider, type: $0) }
            }
            if !files.isEmpty {
                TerminalDebugLog.log(.input, "drop staging \(files.count) file(s)")
                TerminalFileStaging.stage(files) { [weak self] paths in
                    guard let self, let paths else {
                        TerminalDebugLog.log(.input, "drop skipped: no file could be staged")
                        return
                    }
                    TerminalDebugLog.log(.input, "drop files bytes=\(paths.utf8.count)")
                    _ = surface?.paste(text: paths)
                }
                return
            }
            if session.canLoadObjects(ofClass: NSURL.self) {
                _ = session.loadObjects(ofClass: NSURL.self) { [weak self] objects in
                    let urls = objects.compactMap { ($0 as? NSURL).map { $0 as URL } }
                    guard let self, let text = TerminalPasteboardContent.text(string: nil, urls: urls) else { return }
                    TerminalDebugLog.log(.input, "drop urls count=\(urls.count)")
                    _ = surface?.paste(text: text)
                }
                return
            }
            if session.canLoadObjects(ofClass: NSString.self) {
                _ = session.loadObjects(ofClass: NSString.self) { [weak self] objects in
                    let text = objects.compactMap { ($0 as? NSString).map { $0 as String } }.joined()
                    guard let self, !text.isEmpty else { return }
                    TerminalDebugLog.log(.input, "drop text bytes=\(text.utf8.count)")
                    _ = surface?.paste(text: text)
                }
            }
        }
    }
#endif
