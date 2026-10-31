//
//  UITerminalView+UITextInput.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import GhosttyKit
    import UIKit

    /// UITextInput delegate wiring; behavior lives in +UITextInput.
    struct TextInputBridgeState {
        weak var inputDelegate: (any UITextInputDelegate)?
    }

    extension UITerminalView: UITextInput, UITextInputTraits {
        // MARK: - UITextInputTraits

        open var autocorrectionType: UITextAutocorrectionType {
            get { .no }
            set {}
        }

        open var autocapitalizationType: UITextAutocapitalizationType {
            get { .none }
            set {}
        }

        open var smartQuotesType: UITextSmartQuotesType {
            get { .no }
            set {}
        }

        open var smartDashesType: UITextSmartDashesType {
            get { .no }
            set {}
        }

        open var smartInsertDeleteType: UITextSmartInsertDeleteType {
            get { .no }
            set {}
        }

        open var spellCheckingType: UITextSpellCheckingType {
            get { .no }
            set {}
        }

        /// Off for the same reason as autocorrection, and doubly so: the
        /// system delivers inline predictions as marked text, which a
        /// terminal renders as highlighted preedit at the caret — plain
        /// typing then looks perpetually selected.
        @available(iOS 17.0, *)
        open var inlinePredictionType: UITextInlinePredictionType {
            get { .no }
            set {}
        }

        open var keyboardType: UIKeyboardType {
            get { .default }
            set {}
        }

        // MARK: - UIKeyInput

        open func insertText(_ text: String) {
            #if targetEnvironment(macCatalyst)
                // The text input system may hand over a key's text with no
                // press reported for it — on macOS 26 a letter or Delete
                // arrives here that way, as Ctrl combos do everywhere (see
                // `keyCommands`). A key went down all the same, and it ends
                // the repeat of one still held, as a press would.
                stopKeyRepeat()
            #else
                claimPendingInputMethodKeys()
            #endif
            // A lone, unmarked "\n"/"\r" is the software keyboard's Return —
            // it must travel the key path (bracketed paste turns a text-path
            // newline into a literal insertion instead of accepting the
            // line). Longer strings containing newlines (dictation, actual
            // pastes) stay on the text path, where paste semantics are
            // correct.
            let route = TerminalSoftwareKeyCommitRouter.route(
                text: text,
                hasMarkedText: inputHandler.hasMarkedText,
                hardwareKeyHandled: hardwareKeyboard.keyHandled,
            )

            if route == .suppressHardwareDuplicate {
                TerminalDebugLog.log(
                    .input,
                    "insertText suppressed text=\(TerminalDebugLog.describe(text))",
                )
                hardwareKeyboard.keyHandled = false
                return
            }

            if route == .semanticEnter {
                #if !targetEnvironment(macCatalyst)
                    let mods = stickyModifiers.consumeForNextKey()
                    TerminalDebugLog.log(
                        .input,
                        "insertText semantic enter mods=0x\(String(mods.ghosttyMods.rawValue, radix: 16))",
                    )
                    sendSyntheticKey(usage: 0x28, additionalMods: mods)
                #else
                    sendReturnKey()
                #endif
                return
            }

            #if !targetEnvironment(macCatalyst)
                if inputHandler.hasMarkedText {
                    inputHandler.insertText(text)
                    return
                }

                if stickyModifiers.hasActiveModifiers {
                    _ = handleStickyTextInput(text)
                    return
                }
            #endif

            inputHandler.insertText(text)
        }

        #if targetEnvironment(macCatalyst)
            /// Deliver Return exactly as a hardware keyboard would: one Enter key
            /// event through the core's key encoder, so terminal modes (kitty
            /// keyboard protocol included) keep deciding the bytes. iOS routes
            /// semantic Enter through sendSyntheticKey (sticky modifiers apply);
            /// Catalyst has no accessory bar, so this direct path remains.
            private func sendReturnKey() {
                let usage = UInt16(UIKeyboardHIDUsage.keyboardReturnOrEnter.rawValue)

                var keyEvent = ghostty_input_key_s()
                keyEvent.action = GHOSTTY_ACTION_PRESS
                keyEvent.mods = ghostty_input_mods_e(rawValue: 0)
                keyEvent.keycode = TerminalHardwareKeyRouter.appKitKeyCodeForUIKit(
                    usage: usage,
                )
                keyEvent.composing = false

                let carriageReturn = "\r"
                carriageReturn.withCString { ptr in
                    keyEvent.text = ptr
                    sendInputKeyEvent(keyEvent)
                }
                // The matching release, so a kitty-protocol program with event
                // reporting never sees Return held down.
                keyEvent.action = GHOSTTY_ACTION_RELEASE
                keyEvent.text = nil
                sendInputKeyEvent(keyEvent)
            }
        #endif

        open func deleteBackward() {
            #if targetEnvironment(macCatalyst)
                // A key went down, pressed or not; see `insertText`.
                stopKeyRepeat()
            #else
                claimPendingInputMethodKeys()
            #endif
            if inputHandler.deleteBackwardInMarkedText() {
                TerminalDebugLog.log(.input, "deleteBackward handled by marked text")
                hardwareKeyboard.keyHandled = false
                return
            }

            guard !hardwareKeyboard.keyHandled else {
                TerminalDebugLog.log(.input, "deleteBackward suppressed")
                hardwareKeyboard.keyHandled = false
                return
            }

            let usage = UInt16(UIKeyboardHIDUsage.keyboardDeleteOrBackspace.rawValue)

            #if !targetEnvironment(macCatalyst)
                if stickyModifiers.hasActiveModifiers {
                    let mods = stickyModifiers.consumeForNextKey()
                    sendSyntheticKey(usage: usage, additionalMods: mods)
                    return
                }
            #endif

            var keyEvent = ghostty_input_key_s()
            keyEvent.action = GHOSTTY_ACTION_PRESS
            keyEvent.mods = ghostty_input_mods_e(rawValue: 0)
            keyEvent.keycode = TerminalHardwareKeyRouter.appKitKeyCodeForUIKit(
                usage: usage,
            )
            keyEvent.composing = false

            let delete = "\u{7F}"
            delete.withCString { ptr in
                keyEvent.text = ptr
                sendInputKeyEvent(keyEvent)
            }
            keyEvent.action = GHOSTTY_ACTION_RELEASE
            keyEvent.text = nil
            sendInputKeyEvent(keyEvent)
        }

        // MARK: - UITextInput Marked Text

        open func setMarkedText(
            _ markedText: String?,
            selectedRange: NSRange,
        ) {
            #if !targetEnvironment(macCatalyst)
                claimPendingInputMethodKeys()
            #endif
            inputHandler.setMarkedText(markedText, selectedRange: selectedRange)
        }

        open func unmarkText() {
            #if !targetEnvironment(macCatalyst)
                claimPendingInputMethodKeys()
            #endif
            inputHandler.unmarkText(applyingStickyModifiers: false)
        }

        open var markedTextRange: UITextRange? {
            inputHandler.markedTextRange()
        }

        open var markedTextStyle: [NSAttributedString.Key: Any]? {
            get { nil }
            set {}
        }

        // MARK: - UITextInput Selection

        open var selectedTextRange: UITextRange? {
            get { inputHandler.selectedTextRange() }
            set { inputHandler.setSelectedTextRange(newValue) }
        }

        // MARK: - UITextInput Positions

        open var beginningOfDocument: UITextPosition {
            TerminalTextPosition(0)
        }

        open var endOfDocument: UITextPosition {
            TerminalTextPosition(inputHandler.document.length)
        }

        open func textRange(
            from fromPosition: UITextPosition,
            to toPosition: UITextPosition,
        ) -> UITextRange? {
            guard
                let from = fromPosition as? TerminalTextPosition,
                let to = toPosition as? TerminalTextPosition
            else { return nil }
            return TerminalTextRange(start: from, end: to)
        }

        open func position(
            from position: UITextPosition,
            offset: Int,
        ) -> UITextPosition? {
            guard let pos = position as? TerminalTextPosition else { return nil }
            let newIndex = pos.index + offset
            guard newIndex >= 0, newIndex <= inputHandler.document.length else { return nil }
            return TerminalTextPosition(newIndex)
        }

        open func position(
            from position: UITextPosition,
            in _: UITextLayoutDirection,
            offset: Int,
        ) -> UITextPosition? {
            self.position(from: position, offset: offset)
        }

        open func compare(
            _ position: UITextPosition,
            to other: UITextPosition,
        ) -> ComparisonResult {
            guard
                let lhs = position as? TerminalTextPosition,
                let rhs = other as? TerminalTextPosition
            else { return .orderedSame }

            if lhs.index < rhs.index {
                return .orderedAscending
            }
            if lhs.index > rhs.index {
                return .orderedDescending
            }
            return .orderedSame
        }

        open func offset(
            from: UITextPosition,
            to toPosition: UITextPosition,
        ) -> Int {
            guard
                let f = from as? TerminalTextPosition,
                let t = toPosition as? TerminalTextPosition
            else { return 0 }
            return t.index - f.index
        }

        // MARK: - UITextInput Text

        open func text(in range: UITextRange) -> String? {
            guard let range = range as? TerminalTextRange else { return nil }
            return inputHandler.text(in: range)
        }

        open func replace(_: UITextRange, withText text: String) {
            #if !targetEnvironment(macCatalyst)
                claimPendingInputMethodKeys()
            #endif
            #if !targetEnvironment(macCatalyst)
                if inputHandler.hasMarkedText {
                    inputHandler.insertText(text)
                    return
                }

                if stickyModifiers.hasActiveModifiers {
                    _ = handleStickyTextInput(text)
                    return
                }
            #endif

            inputHandler.insertText(text)
        }

        // MARK: - UITextInput Delegate

        open var inputDelegate: (any UITextInputDelegate)? {
            get { textInputBridge.inputDelegate }
            set { textInputBridge.inputDelegate = newValue }
        }

        // MARK: - UITextInput Tokenizer

        open var tokenizer: any UITextInputTokenizer {
            UITextInputStringTokenizer(textInput: self)
        }

        open var textInputView: UIView {
            self
        }

        // MARK: - UITextInput Geometry

        open func firstRect(for range: UITextRange) -> CGRect {
            if let range = range as? TerminalTextRange {
                return rectForRange(range)
            }
            return markedTextRect()
        }

        open func caretRect(for position: UITextPosition) -> CGRect {
            caretRectForPosition(position)
        }

        open func selectionRects(
            for _: UITextRange,
        ) -> [UITextSelectionRect] {
            []
        }

        open func closestPosition(to point: CGPoint) -> UITextPosition? {
            TerminalTextPosition(textIndex(for: point))
        }

        open func closestPosition(
            to point: CGPoint,
            within _: UITextRange,
        ) -> UITextPosition? {
            closestPosition(to: point)
        }

        open func characterRange(at point: CGPoint) -> UITextRange? {
            let index = textIndex(for: point)
            return TerminalTextRange(location: index, length: 0)
        }

        open func position(
            within range: UITextRange,
            farthestIn direction: UITextLayoutDirection,
        ) -> UITextPosition? {
            switch direction {
            case .left, .up: return range.start
            case .right, .down: return range.end
            @unknown default: return range.start
            }
        }

        open func characterRange(
            byExtending position: UITextPosition,
            in _: UITextLayoutDirection,
        ) -> UITextRange? {
            let documentLength = inputHandler.document.length
            guard documentLength > 0,
                  let position = position as? TerminalTextPosition
            else {
                return TerminalTextRange(location: 0, length: 0)
            }

            let location = min(max(position.index, 0), documentLength - 1)
            return TerminalTextRange(location: location, length: 1)
        }

        open func baseWritingDirection(
            for _: UITextPosition,
            in _: UITextStorageDirection,
        ) -> NSWritingDirection {
            .leftToRight
        }

        open func setBaseWritingDirection(
            _: NSWritingDirection,
            for _: UITextRange,
        ) {}

        private func imeRect() -> CGRect {
            guard let surface else { return .zero }
            let point = surface.imePoint()
            return CGRect(
                x: point.x,
                y: point.y,
                width: point.width,
                height: point.height,
            )
        }

        private func markedTextRect() -> CGRect {
            let baseRect = imeRect()
            guard
                inputHandler.hasMarkedText,
                let range = markedTextRange as? TerminalTextRange
            else {
                return baseRect
            }

            return rect(for: range, in: baseRect, fallbackWidth: baseRect.width)
        }

        private func rectForRange(_ range: TerminalTextRange) -> CGRect {
            rect(for: range, in: imeRect(), fallbackWidth: 2)
        }

        private func caretRectForPosition(_ position: UITextPosition) -> CGRect {
            let baseRect = imeRect()
            let cellWidth = compositionCellWidth(in: baseRect)
            guard inputHandler.hasMarkedText else {
                let rect = CGRect(
                    x: baseRect.minX,
                    y: baseRect.minY,
                    width: cellWidth,
                    height: baseRect.height,
                )
                TerminalDebugLog.log(
                    .ime,
                    "caretRect empty position base=\(NSCoder.string(for: baseRect)) rect=\(NSCoder.string(for: rect))",
                )
                return rect
            }

            guard let position = position as? TerminalTextPosition else {
                let rect = CGRect(
                    x: baseRect.maxX,
                    y: baseRect.minY,
                    width: cellWidth,
                    height: baseRect.height,
                )
                TerminalDebugLog.log(
                    .ime,
                    "caretRect fallback base=\(NSCoder.string(for: baseRect)) rect=\(NSCoder.string(for: rect))",
                )
                return rect
            }

            let clampedIndex = inputHandler.document.markedOffset(of: position.index)
            let x = baseRect.minX + CGFloat(clampedIndex) * cellWidth
            let rect = CGRect(
                x: x,
                y: baseRect.minY,
                width: cellWidth,
                height: baseRect.height,
            )
            TerminalDebugLog.log(
                .ime,
                "caretRect index=\(clampedIndex) base=\(NSCoder.string(for: baseRect)) cellWidth=\(String(format: "%.2f", cellWidth)) rect=\(NSCoder.string(for: rect))",
            )
            return rect
        }

        private func rect(
            for range: TerminalTextRange,
            in baseRect: CGRect,
            fallbackWidth: CGFloat,
        ) -> CGRect {
            let cellWidth = compositionCellWidth(in: baseRect)
            let markedRange = inputHandler.document.markedRange(
                of: NSRange(location: range.location, length: range.length),
            )
            let x = baseRect.minX + CGFloat(markedRange.location) * cellWidth
            let width = max(CGFloat(markedRange.length) * cellWidth, fallbackWidth)
            return CGRect(
                x: x,
                y: baseRect.minY,
                width: width,
                height: baseRect.height,
            )
        }

        private func compositionCellWidth(in baseRect: CGRect) -> CGFloat {
            if baseRect.width > 0 {
                return max(baseRect.width, 2)
            }

            guard let size = surface?.size() else { return 2 }
            let scale = resolvedDisplayScale()
            guard scale > 0 else { return CGFloat(max(size.cellWidthPixels, 2)) }
            return max(CGFloat(size.cellWidthPixels) / scale, 2)
        }

        private func textIndex(for point: CGPoint) -> Int {
            let baseRect = imeRect()
            let document = inputHandler.document
            guard document.markedLength > 0 else { return document.position(ofMarkedOffset: 0) }

            let cellWidth = compositionCellWidth(in: baseRect)
            guard cellWidth > 0 else { return document.position(ofMarkedOffset: 0) }

            let relativeX = point.x - baseRect.minX
            let rawIndex = Int((relativeX / cellWidth).rounded(.down))
            let index = document.position(ofMarkedOffset: rawIndex)
            TerminalDebugLog.log(
                .ime,
                "textIndex point=\(NSCoder.string(for: point)) base=\(NSCoder.string(for: baseRect)) cellWidth=\(String(format: "%.2f", cellWidth)) index=\(index)",
            )
            return index
        }
    }
#endif
