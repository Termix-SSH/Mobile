//
//  UITerminalView+Clipboard.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit

    extension UITerminalView {
        @IBAction override open func copy(_: Any?) {
            copySelectedTextToPasteboard()
        }

        @IBAction override open func select(_ sender: Any?) {
            guard usesInlineTextSelection, let point = touchSelection.menuPoint else {
                super.select(sender)
                return
            }
            beginTouchSelection(at: point, selectAll: false)
        }

        @IBAction override open func selectAll(_ sender: Any?) {
            guard usesInlineTextSelection, let point = touchSelection.menuPoint else {
                super.selectAll(sender)
                return
            }
            beginTouchSelection(at: point, selectAll: true)
        }

        /// A paste has to reach the surface as a paste.
        ///
        /// `UIResponder`'s default implementation for a `UIKeyInput` conformer
        /// pastes by calling `insertText(_:)`, and that path now encodes text
        /// as key input — which strips the bracketed-paste markers a shell
        /// relies on to tell pasted text from typing. A pasted command with
        /// newlines would run line by line instead of landing in the edit
        /// buffer. Taking the action ourselves routes it through ghostty's
        /// own paste binding (`pasteFromPasteboard`), where the text path,
        /// the mode 2004 wrapping, and paste protection all live.
        @IBAction override open func paste(_: Any?) {
            pasteFromPasteboard()
        }

        /// Every host-driven paste — the edit menu, the accessory bar's
        /// button — of text enters through ghostty's own paste binding, the
        /// pipeline a hardware Cmd+V already used: the `read_clipboard`
        /// callback reads the pasteboard, and paste protection gets to ask
        /// before an unsafe paste lands.
        ///
        /// A pasteboard holding only image or document data is the one case
        /// handled here: the data is written to a file and its escaped path
        /// goes straight to the text path. A path carries nothing paste
        /// protection weighs (no line breaks, no control characters), and a
        /// program's own clipboard read must never write a file — so that
        /// work belongs to the host's button, not the callback.
        func pasteFromPasteboard() {
            dismissTouchSelection()
            if inputHandler.hasMarkedText {
                inputHandler.unmarkText()
            }
            if TerminalPasteboardContent.text() != nil {
                _ = surface?.performBindingAction("paste_from_clipboard")
                return
            }
            TerminalPasteboardContent.files { [weak self] paths in
                guard let self, let paths else {
                    TerminalDebugLog.log(.input, "paste skipped: pasteboard has nothing pasteable")
                    return
                }
                TerminalDebugLog.log(.input, "paste files bytes=\(paths.utf8.count)")
                surface?.paste(text: paths)
            }
        }

        override open func canPerformAction(
            _ action: Selector,
            withSender sender: Any?,
        ) -> Bool {
            if usesInlineTextSelection, action == #selector(select(_:)) || action == #selector(selectAll(_:)) {
                return surface != nil && touchSelection.menuPoint != nil
                    && (action == #selector(selectAll(_:)) || touchSelection.range == nil)
            }
            if action == #selector(copy(_:)) {
                return touchSelection.range != nil || surface?.hasSelection() == true
            }
            if action == #selector(paste(_:)) {
                return TerminalPasteboardContent.hasContent()
            }
            return super.canPerformAction(action, withSender: sender)
        }
    }

    extension UITerminalView: UIContextMenuInteractionDelegate {
        open func contextMenuInteraction(
            _: UIContextMenuInteraction,
            configurationForMenuAtLocation location: CGPoint,
        ) -> UIContextMenuConfiguration? {
            #if !targetEnvironment(macCatalyst)
                if usesInlineTextSelection, touchSelection.lastInputWasDirect, pointer.session.reported == nil {
                    return nil
                }
            #endif
            sendPointerPosition(at: location)
            guard TerminalPointerPolicy.shouldPresentHostSecondaryMenu(
                mouseCaptured: surface?.isMouseCaptured == true,
            ) else { return nil }
            guard selectionMenuPoint(at: location) != nil else { return nil }

            return selectionContextMenuConfiguration(at: location)
        }
    }
#endif
