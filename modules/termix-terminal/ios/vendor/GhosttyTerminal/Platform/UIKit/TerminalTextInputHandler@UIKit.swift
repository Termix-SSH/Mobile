//
//  TerminalTextInputHandler@UIKit.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import GhosttyKit
    import UIKit

    @MainActor
    final class TerminalTextInputHandler {
        private weak var view: UITerminalView?
        private var markedTextState = TerminalMarkedTextState()

        var hasMarkedText: Bool {
            markedTextState.hasMarkedText
        }

        // Positions the UITextInput document holds before the marked text.
        //
        // The software keyboard's held Delete stops the moment the caret is
        // at the start of the document: before every repeat, UIKit's
        // `handleAutoDeleteWithExecutionContext:` asks
        // `-[UIResponder _selectionAtDocumentStart]` — `compare(
        // selectedTextRange.start, beginningOfDocument) == .orderedSame` —
        // and clears the repeat timer when it says yes. A terminal's
        // document is only ever the composition, empty at a prompt, so the
        // caret was always at its start and a held Delete sent exactly one
        // backspace. One position of anchor ahead of the composition keeps
        // the caret off the start; it carries no text, so what the keyboard
        // reads as context is unchanged. Catalyst has no software keyboard
        // and keeps the plain document.
        #if targetEnvironment(macCatalyst)
            private static let documentAnchorLength = 0
        #else
            private static let documentAnchorLength = 1
        #endif

        /// The UITextInput document. Every `TerminalTextPosition` the view
        /// hands UIKit is a position in it.
        var document: TerminalInputDocument {
            TerminalInputDocument(
                anchorLength: Self.documentAnchorLength,
                markedLength: markedTextState.documentLength,
            )
        }

        init(view: UITerminalView) {
            self.view = view
        }

        // MARK: - Text Input

        func insertText(
            _ text: String,
            applyingStickyModifiers: Bool = false,
        ) {
            guard let view else { return }
            let shouldNotifySelectionChange = shouldNotifySelectionChange

            TerminalDebugLog.log(
                .input,
                "insertText text=\(TerminalDebugLog.describe(text)) marked=\(hasMarkedText)",
            )

            view.inputDelegate?.textWillChange(view)
            if shouldNotifySelectionChange {
                view.inputDelegate?.selectionWillChange(view)
            }

            markedTextState.clear()
            view.surface?.preedit("")
            #if !targetEnvironment(macCatalyst)
                if applyingStickyModifiers {
                    _ = view.handleStickyCommittedText(text)
                } else {
                    sendTypedText(text)
                }
            #else
                sendTypedText(text)
            #endif
            view.refreshInputAccessoryContent()

            if shouldNotifySelectionChange {
                view.inputDelegate?.selectionDidChange(view)
            }
            view.inputDelegate?.textDidChange(view)
        }

        /// Deliver keyboard text the way a hardware keystroke does: on a key
        /// event that carries the text, so ghostty's key encoder writes the
        /// bytes.
        ///
        /// `ghostty_surface_text` is documented as "treated like a paste" —
        /// it lands in `completeClipboardPaste`, so with bracketed paste
        /// (mode 2004) active every software-keyboard character reaches the
        /// shell wrapped in `ESC[200~ … ESC[201~`. zsh renders a pasted
        /// region with `zle_highlight`'s `paste:standout`, which is why the
        /// character just typed shows up reverse-video until the next edit
        /// redraws the line. AppKit never hits this because typed text rides
        /// its `keyDown` event, and the bundled sample app never hits it
        /// because its simulated shell has no bracketed paste at all.
        ///
        /// The keycode is deliberately out of the AppKit virtual-keycode
        /// table, so ghostty resolves the physical key to `.unidentified`
        /// and encodes from the text alone. Both of ghostty's encoders
        /// handle that: the legacy one writes unmodified printable text
        /// directly, and the Kitty one treats an unmapped key carrying UTF-8
        /// as a pure text event — the same shape IME commits already had.
        ///
        /// Real pastes (the accessory's Paste button, the edit menu's
        /// `paste(_:)`) keep using `paste(text:)`, where the bracketed-paste
        /// markers belong. Text with newlines is routed there too: whatever
        /// produced it, a shell must not see those lines as Return presses.
        private func sendTypedText(_ text: String) {
            guard let view, !text.isEmpty else { return }

            guard !text.contains(where: \.isNewline) else {
                TerminalDebugLog.log(
                    .input,
                    "typed text has newlines, sending as paste bytes=\(text.utf8.count)",
                )
                view.paste(text: text)
                return
            }

            var event = ghostty_input_key_s()
            event.action = GHOSTTY_ACTION_PRESS
            event.mods = ghostty_input_mods_e(rawValue: 0)
            event.consumed_mods = ghostty_input_mods_e(rawValue: 0)
            event.keycode = 0xFFFF
            event.composing = false
            event.unshifted_codepoint = text.unicodeScalars.first.map(\.value) ?? 0

            text.withCString { ptr in
                event.text = ptr
                view.sendInputKeyEvent(event)
            }
        }

        func setMarkedText(_ text: String?, selectedRange: NSRange) {
            guard let view else { return }
            let shouldNotifySelectionChange = shouldNotifySelectionChange

            TerminalDebugLog.log(
                .ime,
                "setMarkedText text=\(TerminalDebugLog.describe(text)) selected=\(TerminalDebugLog.describe(selectedRange))",
            )

            #if !targetEnvironment(macCatalyst)
                if let text, !text.isEmpty {
                    if view.stickyModifiers.hasActiveModifiers {
                        view.inputDelegate?.textWillChange(view)
                        if shouldNotifySelectionChange {
                            view.inputDelegate?.selectionWillChange(view)
                        }

                        markedTextState.clear()
                        view.surface?.preedit("")
                        _ = view.handleStickyMarkedText(text)
                        view.refreshInputAccessoryContent()

                        if shouldNotifySelectionChange {
                            view.inputDelegate?.selectionDidChange(view)
                        }
                        view.inputDelegate?.textDidChange(view)
                        return
                    }
                }
            #endif

            view.dismissTouchSelection()
            view.inputDelegate?.textWillChange(view)
            view.inputDelegate?.selectionWillChange(view)

            markedTextState.setMarkedText(text, selectedRange: selectedRange)

            if let text = markedTextState.text, !text.isEmpty {
                view.surface?.preedit(text)
            } else {
                view.surface?.preedit("")
            }
            view.refreshInputAccessoryContent()

            view.inputDelegate?.selectionDidChange(view)
            view.inputDelegate?.textDidChange(view)
        }

        func unmarkText(
            applyingStickyModifiers: Bool = false,
        ) {
            guard let view else { return }
            let shouldNotifySelectionChange = shouldNotifySelectionChange
            let committedText = markedTextState.text

            TerminalDebugLog.log(
                .ime,
                "unmarkText committed=\(TerminalDebugLog.describe(committedText))",
            )

            view.inputDelegate?.textWillChange(view)
            if shouldNotifySelectionChange {
                view.inputDelegate?.selectionWillChange(view)
            }

            markedTextState.clear()
            view.surface?.preedit("")
            if let committedText, !committedText.isEmpty {
                #if !targetEnvironment(macCatalyst)
                    if applyingStickyModifiers {
                        _ = view.handleStickyCommittedText(committedText)
                    } else {
                        sendTypedText(committedText)
                    }
                #else
                    sendTypedText(committedText)
                #endif
            }
            view.refreshInputAccessoryContent()

            if shouldNotifySelectionChange {
                view.inputDelegate?.selectionDidChange(view)
            }
            view.inputDelegate?.textDidChange(view)
        }

        func markedTextRange() -> TerminalTextRange? {
            guard markedTextState.hasMarkedText else { return nil }
            return TerminalTextRange(
                location: document.position(ofMarkedOffset: markedTextState.markedRange.location),
                length: markedTextState.markedRange.length,
            )
        }

        func selectedTextRange() -> TerminalTextRange {
            TerminalTextRange(
                location: document.position(ofMarkedOffset: markedTextState.selectedRange.location),
                length: markedTextState.selectedRange.length,
            )
        }

        func setSelectedTextRange(_ range: UITextRange?) {
            let clampedRange = if let range = range as? TerminalTextRange {
                document.markedRange(of: NSRange(location: range.location, length: range.length))
            } else {
                NSRange(location: 0, length: 0)
            }
            guard markedTextState.selectedRange != clampedRange else { return }
            TerminalDebugLog.log(
                .ime,
                "setSelectedTextRange range=\(TerminalDebugLog.describe(clampedRange))",
            )
            notifySelectionWillChange()
            markedTextState.setMarkedText(markedTextState.text, selectedRange: clampedRange)
            notifySelectionDidChange()
        }

        func text(in range: TerminalTextRange) -> String? {
            let document = document
            guard range.location >= 0, range.length >= 0, range.location + range.length <= document.length else { return nil }
            let markedRange = document.markedRange(of: NSRange(location: range.location, length: range.length))
            return markedTextState.text(in: markedRange)
        }

        func deleteBackwardInMarkedText() -> Bool {
            guard let view else { return false }
            guard markedTextState.hasMarkedText else { return false }
            let shouldNotifySelectionChange = shouldNotifySelectionChange
            TerminalDebugLog.log(
                .ime,
                "deleteBackwardInMarkedText selected=\(TerminalDebugLog.describe(markedTextState.selectedRange))",
            )
            view.inputDelegate?.textWillChange(view)
            if shouldNotifySelectionChange {
                view.inputDelegate?.selectionWillChange(view)
            }

            _ = markedTextState.deleteBackward()
            view.surface?.preedit(markedTextState.text ?? "")
            view.refreshInputAccessoryContent()

            if shouldNotifySelectionChange {
                view.inputDelegate?.selectionDidChange(view)
            }
            view.inputDelegate?.textDidChange(view)
            return true
        }

        func notifyGeometryDidChange(reason: String) {
            guard let view else { return }
            TerminalDebugLog.log(
                .ime,
                "notifyGeometryDidChange reason=\(reason) selected=\(TerminalDebugLog.describe(markedTextState.selectedRange)) documentLength=\(markedTextState.documentLength) marked=\(hasMarkedText)",
            )
            view.inputDelegate?.selectionWillChange(view)
            view.inputDelegate?.selectionDidChange(view)
            if view.isFirstResponder {
                view.reloadInputViews()
            }
        }

        private var shouldNotifySelectionChange: Bool {
            hasMarkedText
                || markedTextState.selectedRange.location != 0
                || markedTextState.selectedRange.length != 0
        }

        private func notifySelectionWillChange() {
            if let view {
                view.inputDelegate?.selectionWillChange(view)
            }
        }

        private func notifySelectionDidChange() {
            if let view {
                view.inputDelegate?.selectionDidChange(view)
            }
        }
    }
#endif
