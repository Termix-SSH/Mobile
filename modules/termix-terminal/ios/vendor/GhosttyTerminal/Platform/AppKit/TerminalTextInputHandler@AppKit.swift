//
//  TerminalTextInputHandler@AppKit.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/16.
//  Reference:
//  - ghostty-org/ghostty
//  - macos/Sources/Ghostty/Surface View/SurfaceView_AppKit.swift
//  IME text accumulation intentionally follows Ghostty's AppKit flow:
//  marked/preedit text is passed through as-is, without extra app-specific
//  filtering, so composition behavior stays consistent with upstream.
//

#if !canImport(UIKit) && canImport(AppKit)
    import AppKit
    import GhosttyKit

    @MainActor
    final class TerminalTextInputHandler: NSObject {
        private weak var view: AppTerminalView?
        private var markedTextState = TerminalMarkedTextState()
        private var accumulatedTexts: [String]?

        var hasMarkedText: Bool {
            markedTextState.hasMarkedText
        }

        init(view: AppTerminalView) {
            self.view = view
            super.init()
        }

        func startCollectingText() {
            accumulatedTexts = []
        }

        func finishCollectingText() -> [String]? {
            defer { accumulatedTexts = nil }
            guard let texts = accumulatedTexts, !texts.isEmpty else { return nil }
            return texts
        }

        // MARK: - Text Input

        func insertText(_ string: Any) {
            guard NSApp.currentEvent != nil else { return }

            let text: String
            if let attrStr = string as? NSAttributedString {
                text = attrStr.string
            } else if let str = string as? String {
                text = str
            } else {
                return
            }

            unmarkText()

            if accumulatedTexts != nil {
                accumulatedTexts?.append(text)
            } else {
                view?.surface?.paste(text: text)
            }
        }

        func setMarkedText(
            _ string: Any,
            selectedRange: NSRange,
        ) {
            let text: String
            if let attrStr = string as? NSAttributedString {
                text = attrStr.string
            } else if let str = string as? String {
                text = str
            } else {
                return
            }

            markedTextState.setMarkedText(text, selectedRange: selectedRange)

            if accumulatedTexts == nil {
                syncPreedit()
            }
        }

        func unmarkText() {
            guard markedTextState.hasMarkedText else { return }
            markedTextState.clear()
            syncPreedit()
        }

        /// Commits an open composition as typed text on the key path — what
        /// a hardware key would have done through `interpretKeyEvents` —
        /// instead of dropping it. The keycode is deliberately outside the
        /// AppKit virtual-keycode table so ghostty resolves the key to
        /// `.unidentified` and encodes from the text alone, as the UIKit
        /// twin's `sendTypedText` does.
        func commitMarkedText() {
            guard let text = markedTextState.text else { return }
            markedTextState.clear()
            syncPreedit()

            var event = ghostty_input_key_s()
            event.action = GHOSTTY_ACTION_PRESS
            event.mods = ghostty_input_mods_e(rawValue: 0)
            event.consumed_mods = ghostty_input_mods_e(rawValue: 0)
            event.keycode = 0xFFFF
            event.composing = false
            event.unshifted_codepoint = text.unicodeScalars.first.map(\.value) ?? 0

            text.withCString { ptr in
                event.text = ptr
                view?.surface?.sendKeyEvent(event)
            }
        }

        func currentSelectedRange() -> NSRange {
            markedTextState.currentSelectedRange
        }

        func markedRange() -> NSRange {
            markedTextState.markedRange
        }

        func attributedSubstring(
            forProposedRange range: NSRange,
            actualRange: NSRangePointer?,
        ) -> NSAttributedString? {
            guard markedTextState.hasMarkedText else {
                return nil
            }

            let length = markedTextState.documentLength
            let location = min(max(range.location, 0), length)
            let end = min(max(range.location + range.length, location), length)
            let clampedRange = NSRange(location: location, length: end - location)
            actualRange?.pointee = clampedRange

            guard let text = markedTextState.text(in: clampedRange) else {
                return nil
            }
            return NSAttributedString(string: text)
        }

        func syncPreedit(clearIfNeeded: Bool = true) {
            guard let text = markedTextState.text else {
                guard clearIfNeeded else { return }
                view?.surface?.preedit("")
                return
            }

            view?.surface?.preedit(text)
        }
    }
#endif
