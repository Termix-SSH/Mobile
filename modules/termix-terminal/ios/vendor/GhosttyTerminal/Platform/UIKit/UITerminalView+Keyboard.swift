//
//  UITerminalView+Keyboard.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/17.
//

#if canImport(UIKit)
    import GhosttyKit
    import UIKit

    /// Hardware-keyboard routing state; behavior lives in +Keyboard.
    struct HardwareKeyboardState {
        /// A press the key path already delivered, telling the UITextInput
        /// echo to stay silent.
        var keyHandled = false
        /// Copy is handled by the view; its repeat and release never reach the core.
        var touchCopyKeycodes: Set<UInt32> = []
        /// Signatures of keys already delivered this runloop turn by one of
        /// the two paths that can carry a key we register as a `UIKeyCommand`
        /// (the Ctrl combos, Escape). One physical press can reach us twice —
        /// `pressesBegan` and the matching command — and which arrives (or
        /// both) varies by iPadOS version; whichever runs first claims the
        /// press here.
        var recentKeyCommandDeliveries: Set<String> = []
        /// Keys loaned to the input method this runloop turn. The text input
        /// system claims them through any UITextInput mutation; whatever is
        /// still here when the turn ends is replayed to the surface.
        var pendingInputMethodKeys: [DeferredInputMethodKey] = []
        var inputMethodFlushScheduled = false
        /// Keys were replayed raw and no UITextInput mutation has arrived
        /// since. A mutation now is the input method answering late — the
        /// replay typed those keys twice.
        var replayedKeysAwaitingClaim = false
        /// Learned once per process — not per view, or every new tab would
        /// re-calibrate: the text input system ignored a loaned key
        /// outright, so deferred presses must be forwarded to it at the
        /// application — the route that feeds them to the input method on
        /// the iPadOS versions that do not process hardware keys on their
        /// own.
        @MainActor static var inputMethodNeedsPressForwarding = false
        /// Set on the first claim: the input method demonstrably hears our
        /// keys. From then on an unclaimed forwarded key is never replayed
        /// raw — the input method's responses arrive asynchronously (they
        /// round-trip the keyboard daemon), and replaying a key it is still
        /// composing types it twice.
        @MainActor static var inputMethodProvenResponsive = false
        /// Presses currently loaned to the input method; their release must
        /// not reach the surface (a replay sends its own synthetic pair).
        var pressesLoanedToInputMethod: Set<UIPress> = []
        /// Presses whose began was forwarded to the text input system;
        /// their ended must complete there too.
        var pressesForwardedToInputMethod: Set<UIPress> = []
        /// Last hardware modifier flags seen on a `UIKey`. Pointer events
        /// read this when the hover recognizer is not the live source.
        var heldModifierFlags: UIKeyModifierFlags = []
        /// The held key being repeated, if any. See `startKeyRepeat`.
        var keyRepeat: KeyRepeat?

        /// A repeating key: the press, whose release ends the repeat and
        /// whose key each repeat sends, and the timer that sends them.
        struct KeyRepeat {
            let press: UIPress
            let timer: Timer
        }
    }

    /// Software-keyboard visibility and tap-to-toggle state; behavior in
    /// +Keyboard (observers) and +Interaction (touch handling).
    struct SoftwareKeyboardState {
        var isVisible = false
        /// The active direct-touch sequence can still resolve to a clean
        /// tap. Armed on the first finger down; disarmed by a second
        /// finger, by movement past the slop, by any recognized gesture
        /// (scroll pan, pinch, long press), or by the press running long.
        /// Only a sequence still armed at touch end toggles the keyboard —
        /// a drag, zoom, or hold must never count as the tap.
        var tapCandidateArmed = false
        var tapCandidateStart: CGPoint = .zero
        var tapCandidateTimestamp: TimeInterval = 0
    }

    /// A hardware key loaned to the input method, kept ready to replay:
    /// everything the direct path would have put on the key event.
    struct DeferredInputMethodKey {
        let action: ghostty_input_action_e
        let keycode: UInt32
        let mods: ghostty_input_mods_e
        let consumedMods: ghostty_input_mods_e
        let unshiftedCodepoint: UInt32
        let text: String?
        /// The physical press, held for the turn so a calibration flush can
        /// still hand it to the text input system instead of leaking raw text.
        weak var press: UIPress?
        /// The press has been given to the text input system (at press
        /// time or by a calibration flush); the next unclaimed flush
        /// replays it raw rather than retrying forever.
        var forwardAttempted: Bool
    }

    extension UITerminalView {
        override open func pressesBegan(
            _ presses: Set<UIPress>,
            with event: UIPressesEvent?,
        ) {
            #if targetEnvironment(macCatalyst)
                for press in presses {
                    guard let key = press.key else { continue }
                    if !TerminalKeyRepeat.isModifier(usage: UInt16(key.keyCode.rawValue)) {
                        stopKeyRepeat()
                    }
                    guard handleKeyPress(key, action: GHOSTTY_ACTION_PRESS) else { continue }
                    startKeyRepeat(for: press)
                }
            #else
                var forwardedToInputMethod: Set<UIPress> = []
                for press in presses {
                    guard let key = press.key else { continue }
                    // Only the most recent key repeats, as on every desktop:
                    // a new key down ends the old repeat. A modifier going
                    // down leaves it alone — shift pressed mid-repeat does not
                    // stop the letter.
                    if !TerminalKeyRepeat.isModifier(usage: UInt16(key.keyCode.rawValue)) {
                        stopKeyRepeat()
                    }
                    if shouldDeferKeyToInputMethod(key) {
                        TerminalDebugLog.log(
                            .input,
                            "uikit key deferred to input method code=\(key.keyCode.rawValue) marked=\(inputHandler.hasMarkedText) lang=\(textInputMode?.primaryLanguage ?? "nil") forwarding=\(HardwareKeyboardState.inputMethodNeedsPressForwarding)",
                        )
                        deferKeyToInputMethod(key, press: press, action: GHOSTTY_ACTION_PRESS)
                        hardwareKeyboard.pressesLoanedToInputMethod.insert(press)
                        if HardwareKeyboardState.inputMethodNeedsPressForwarding {
                            hardwareKeyboard.pressesForwardedToInputMethod.insert(press)
                            forwardedToInputMethod.insert(press)
                        }
                        continue
                    }
                    // Caps Lock switches the input source in the text input
                    // system, which only sees a press that reaches it.
                    guard handleKeyPress(key, action: GHOSTTY_ACTION_PRESS) else {
                        TerminalDebugLog.log(
                            .input,
                            "uikit key ignored by surface, forwarded to text input system code=\(key.keyCode.rawValue)",
                        )
                        hardwareKeyboard.pressesForwardedToInputMethod.insert(press)
                        forwardedToInputMethod.insert(press)
                        continue
                    }
                    startKeyRepeat(for: press)
                }
                // The text input system takes an unhandled press at the
                // application, on the iPadOS versions that do not process
                // hardware keys before presses dispatch.
                if !forwardedToInputMethod.isEmpty {
                    forwardPressesToTextInputSystem(forwardedToInputMethod, phase: .began, with: event)
                }
            #endif
        }

        override open func pressesEnded(
            _ presses: Set<UIPress>,
            with event: UIPressesEvent?,
        ) {
            #if targetEnvironment(macCatalyst)
                for press in presses {
                    if press === hardwareKeyboard.keyRepeat?.press {
                        stopKeyRepeat()
                    }
                    guard let key = press.key else { continue }
                    handleKeyPress(key, action: GHOSTTY_ACTION_RELEASE)
                }
                hardwareKeyboard.keyHandled = false
            #else
                var forwardedToInputMethod: Set<UIPress> = []
                for press in presses {
                    if press === hardwareKeyboard.keyRepeat?.press {
                        stopKeyRepeat()
                    }
                    if hardwareKeyboard.pressesForwardedToInputMethod.remove(press) != nil {
                        forwardedToInputMethod.insert(press)
                    }
                    if hardwareKeyboard.pressesLoanedToInputMethod.remove(press) != nil {
                        // The surface never saw this press (a replayed key
                        // carries its own synthetic release), so it gets no
                        // release either.
                        continue
                    }
                    guard let key = press.key else { continue }
                    handleKeyPress(key, action: GHOSTTY_ACTION_RELEASE)
                }
                hardwareKeyboard.keyHandled = false
                if !forwardedToInputMethod.isEmpty {
                    forwardPressesToTextInputSystem(forwardedToInputMethod, phase: .ended, with: event)
                }
            #endif
        }

        override open func pressesCancelled(
            _ presses: Set<UIPress>,
            with event: UIPressesEvent?,
        ) {
            hardwareKeyboard.keyHandled = false
            if presses.contains(where: { $0 === hardwareKeyboard.keyRepeat?.press }) {
                stopKeyRepeat()
            }
            #if !targetEnvironment(macCatalyst)
                for press in presses {
                    hardwareKeyboard.pressesLoanedToInputMethod.remove(press)
                    hardwareKeyboard.pressesForwardedToInputMethod.remove(press)
                }
            #endif
            forwardPressesToTextInputSystem(presses, phase: .cancelled, with: event)
        }

        /// The surface has no use for a press changing — only its began and
        /// ended carry a key — and the default implementation walks the
        /// responder chain (see `forwardPressesToTextInputSystem`).
        override open func pressesChanged(
            _ presses: Set<UIPress>,
            with event: UIPressesEvent?,
        ) {
            forwardPressesToTextInputSystem(presses, phase: .changed, with: event)
        }

        private enum ForwardedPressPhase {
            case began
            case changed
            case ended
            case cancelled
        }

        /// Hands presses the surface did not take to the text input system,
        /// which reads them at `UIApplication` (`_handleKeyboardPressEvent:`,
        /// behind its `pressesBegan`) — the end of the responder chain.
        ///
        /// Never `super`: that walks the chain, and inside a SwiftUI host the
        /// walk passes SwiftUI's own key-press responder, whose forward on
        /// iPadOS 26.0 lands back on the hosting view below it. The press
        /// circled the terminal's container → hosting view → key-press
        /// responder thousands of times and the main thread overflowed its stack
        /// (`EXC_BAD_ACCESS`, "Thread stack size exceeded due to excessive
        /// recursion") on a Caps Lock, a bare modifier, a language key — any
        /// press the surface left alone. Nothing between the view and the
        /// application has a use for these presses: the surface already
        /// declined them, and they are the text input system's.
        private func forwardPressesToTextInputSystem(
            _ presses: Set<UIPress>,
            phase: ForwardedPressPhase,
            with event: UIPressesEvent?,
        ) {
            let application = UIApplication.shared
            switch phase {
            case .began: application.pressesBegan(presses, with: event)
            case .changed: application.pressesChanged(presses, with: event)
            case .ended: application.pressesEnded(presses, with: event)
            case .cancelled: application.pressesCancelled(presses, with: event)
            }
        }

        #if !targetEnvironment(macCatalyst)
            /// Whether this press belongs to the input method rather than the
            /// terminal — see `TerminalIMEComposition` for the rules.
            private func shouldDeferKeyToInputMethod(_ key: UIKey) -> Bool {
                let flags = filteredModifierFlags(for: key)
                guard flags.isDisjoint(with: [.control, .command]) else { return false }
                return TerminalIMEComposition.shouldDeferKey(
                    characters: key.characters,
                    hasMarkedText: inputHandler.hasMarkedText,
                    inputModeUsesComposition: TerminalIMEComposition
                        .languageUsesComposition(textInputMode?.primaryLanguage),
                )
            }
        #endif

        @discardableResult
        func handleKeyPress(
            _ key: UIKey,
            action: ghostty_input_action_e,
        ) -> Bool {
            notePointerModifierFlags(key.modifierFlags)
            guard surface != nil else {
                TerminalDebugLog.log(.input, "uikit key ignored: missing surface")
                return false
            }

            let filteredModifierFlags = filteredModifierFlags(for: key)
            let isCommandModified = filteredModifierFlags.contains(.command)
            let mods = TerminalInputModifiers(from: filteredModifierFlags)
            let keyboardFontSizeAction = commandFontSizeAction(
                for: key,
                action: action,
                filteredModifierFlags: filteredModifierFlags,
            )

            if action == GHOSTTY_ACTION_PRESS,
               shouldSuppressUIKeyInput(for: key, isCommandModified: isCommandModified)
            {
                hardwareKeyboard.keyHandled = true
            }

            TerminalDebugLog.log(
                .input,
                "uikit key action=\(TerminalDebugLog.describe(action)) code=\(key.keyCode.rawValue) chars=\(TerminalDebugLog.describe(key.characters)) ignoring=\(TerminalDebugLog.describe(key.charactersIgnoringModifiers)) mods=0x\(String(filteredModifierFlags.rawValue, radix: 16)) marked=\(inputHandler.hasMarkedText)",
            )

            var keyEvent = ghostty_input_key_s()
            keyEvent.action = action
            keyEvent.mods = mods.ghosttyMods
            // Ghostty expects a platform-native keycode, which it resolves
            // to its internal Key enum via src/input/keycodes.zig. On iOS
            // that table uses macOS virtual keycodes (native_idx = 4), so
            // translate the documented HID usage value from UIKey into the
            // corresponding AppKit keycode here.
            keyEvent.keycode = TerminalHardwareKeyRouter.appKitKeyCodeForUIKit(
                usage: UInt16(key.keyCode.rawValue),
            )
            keyEvent.composing = inputHandler.hasMarkedText

            var consumedFlags = filteredModifierFlags
            consumedFlags.remove(.control)
            consumedFlags.remove(.command)
            keyEvent.consumed_mods = TerminalInputModifiers(from: consumedFlags).ghosttyMods

            guard action == GHOSTTY_ACTION_PRESS || action == GHOSTTY_ACTION_REPEAT else {
                return sendInputKeyEvent(keyEvent)
            }

            let filteredIgnoringModifiers = TerminalInputText.filteredFunctionKeyText(
                key.charactersIgnoringModifiers,
            )

            if let codepoint = filteredIgnoringModifiers?.unicodeScalars.first {
                keyEvent.unshifted_codepoint = codepoint.value
            }

            // The key command fallback may have sent this very key already
            // (see `controlKeyCommands` and `escapeKeyCommands`); on systems
            // that deliver both, the first claim wins and this press stays
            // silent.
            if action == GHOSTTY_ACTION_PRESS,
               let input = keyCommandInput(for: key, filteredModifierFlags: filteredModifierFlags),
               !claimKeyCommandDelivery(
                   input: input,
                   modifierFlags: filteredModifierFlags,
               )
            {
                return true
            }

            guard !isCommandModified else {
                let consumed = sendInputKeyEvent(keyEvent)
                if let keyboardFontSizeAction {
                    scheduleViewportRefreshAfterKeyboardZoom(keyboardFontSizeAction)
                }
                return consumed
            }

            var derivedText = TerminalInputText.filteredFunctionKeyText(key.characters)

            // Ctrl+letter arrives with `characters` already collapsed to the
            // raw control byte, which the core's key encoder does not accept
            // as a key. AppKit re-derives the printable text without control
            // (NSEvent.filteredCharacters); UIKey cannot re-apply modifier
            // sets, so the unmodified character stands in.
            if filteredModifierFlags.contains(.control),
               let scalars = derivedText?.unicodeScalars,
               scalars.count == 1,
               let scalar = scalars.first,
               scalar.value < 0x20
            {
                derivedText = filteredIgnoringModifiers
            }

            guard let text = derivedText, !text.isEmpty else {
                return sendInputKeyEvent(keyEvent)
            }

            return text.withCString { ptr in
                keyEvent.text = ptr
                return sendInputKeyEvent(keyEvent)
            }
        }

        func shouldSuppressUIKeyInput(
            for key: UIKey,
            isCommandModified: Bool,
        ) -> Bool {
            guard !isCommandModified else { return false }
            // Ctrl and Alt combos travel the key path above, which already
            // carries the composed character (option+a → "å") with alt
            // consumed, exactly as AppKit's keyDown does. The text system's
            // echo would type it a second time; for Ctrl it is a bare
            // control byte with the modifier context stripped
            // (`sendTypedText` zeroes mods), which loses the ctrl semantics
            // as well.
            guard !key.characters.isEmpty else {
                return key.keyCode == .keyboardDeleteOrBackspace
            }
            return true
        }

        /// The `UIKeyCommand.input` this press would arrive under, if it is
        /// one of the keys `keyCommands` registers — the shared signature
        /// both paths claim with. Nil for every other key.
        private func keyCommandInput(
            for key: UIKey,
            filteredModifierFlags: UIKeyModifierFlags,
        ) -> String? {
            if key.keyCode == .keyboardEscape,
               !filteredModifierFlags.contains(.command)
            {
                return UIKeyCommand.inputEscape
            }
            guard filteredModifierFlags.contains(.control) else { return nil }
            return TerminalInputText.filteredFunctionKeyText(key.charactersIgnoringModifiers)
        }

        /// Pointer-only. Does not change key routing.
        func notePointerModifierFlags(_ flags: UIKeyModifierFlags) {
            let relevant = flags.intersection([
                .shift, .control, .alternate, .command, .alphaShift,
            ])
            guard hardwareKeyboard.heldModifierFlags != relevant else { return }
            hardwareKeyboard.heldModifierFlags = relevant
            refreshPointerPositionForModifierChange()
        }

        private func filteredModifierFlags(for key: UIKey) -> UIKeyModifierFlags {
            var flags = key.modifierFlags
            let isFunctionKey =
                TerminalInputText.filteredFunctionKeyText(key.characters) == nil ||
                TerminalInputText.filteredFunctionKeyText(key.charactersIgnoringModifiers) == nil
            if isFunctionKey {
                flags.remove(.numericPad)
            }
            return flags
        }

        /// The font-size binding a Cmd press would run under Ghostty's
        /// default keybinds, for the viewport refresh below. The size itself
        /// is tracked where every key meets the surface
        /// (`TerminalSurface.sendKeyEvent`), and only when Ghostty confirms
        /// the binding.
        private func commandFontSizeAction(
            for key: UIKey,
            action: ghostty_input_action_e,
            filteredModifierFlags: UIKeyModifierFlags,
        ) -> TerminalFontSizeAction? {
            guard action == GHOSTTY_ACTION_PRESS || action == GHOSTTY_ACTION_REPEAT else {
                return nil
            }
            guard filteredModifierFlags.contains(.command) else { return nil }
            return TerminalFontSizeAction(commandKeyCharacters: [
                key.characters,
                key.charactersIgnoringModifiers,
            ])
        }

        private func scheduleViewportRefreshAfterKeyboardZoom(
            _ action: TerminalFontSizeAction,
        ) {
            TerminalDebugLog.log(
                .actions,
                "keyboard zoom shortcut action=\(action)",
            )

            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                core.synchronizeMetrics()
                refreshTextInputGeometry(reason: "keyboard-zoom")
            }
        }
    }

    #if !targetEnvironment(macCatalyst)
        extension UITerminalView {
            func deferKeyToInputMethod(
                _ key: UIKey,
                press: UIPress?,
                action: ghostty_input_action_e,
            ) {
                let mods = TerminalInputModifiers(from: filteredModifierFlags(for: key))
                var consumedFlags = key.modifierFlags
                consumedFlags.remove(.control)
                consumedFlags.remove(.command)

                let unshifted = TerminalInputText.filteredFunctionKeyText(
                    key.charactersIgnoringModifiers,
                )?.unicodeScalars.first?.value ?? 0

                hardwareKeyboard.pendingInputMethodKeys.append(DeferredInputMethodKey(
                    action: action,
                    keycode: TerminalHardwareKeyRouter.appKitKeyCodeForUIKit(
                        usage: UInt16(key.keyCode.rawValue),
                    ),
                    mods: mods.ghosttyMods,
                    consumedMods: TerminalInputModifiers(from: consumedFlags).ghosttyMods,
                    unshiftedCodepoint: unshifted,
                    text: TerminalInputText.filteredFunctionKeyText(key.characters),
                    press: press,
                    // Forwarded at press time whenever calibration already
                    // happened; only then may an unclaimed flush replay raw.
                    forwardAttempted: HardwareKeyboardState.inputMethodNeedsPressForwarding,
                ))
                scheduleInputMethodKeyFlush()
            }

            /// The text input system spoke — every loaned key was heard.
            /// Called from each UITextInput mutation entry point.
            func claimPendingInputMethodKeys() {
                if hardwareKeyboard.replayedKeysAwaitingClaim {
                    // The input method answered after the flush already
                    // replayed its keys (Korean commits can trail the flush).
                    // It is responsive: stop replaying, or every later key
                    // types twice.
                    hardwareKeyboard.replayedKeysAwaitingClaim = false
                    HardwareKeyboardState.inputMethodProvenResponsive = true
                    TerminalDebugLog.log(.input, "input method answered after a replay; no more replays")
                }
                guard !hardwareKeyboard.pendingInputMethodKeys.isEmpty else { return }
                HardwareKeyboardState.inputMethodProvenResponsive = true
                TerminalDebugLog.log(
                    .input,
                    "input method claimed \(hardwareKeyboard.pendingInputMethodKeys.count) deferred key(s)",
                )
                hardwareKeyboard.pendingInputMethodKeys.removeAll()
            }

            private func scheduleInputMethodKeyFlush(after delay: TimeInterval = 0) {
                guard !hardwareKeyboard.inputMethodFlushScheduled else { return }
                hardwareKeyboard.inputMethodFlushScheduled = true
                let flush: @MainActor @Sendable () -> Void = { [weak self] in
                    guard let self else { return }
                    hardwareKeyboard.inputMethodFlushScheduled = false
                    replayUnclaimedInputMethodKeys()
                }
                if delay > 0 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: flush)
                } else {
                    DispatchQueue.main.async(execute: flush)
                }
            }

            private func replayUnclaimedInputMethodKeys() {
                guard !hardwareKeyboard.pendingInputMethodKeys.isEmpty else { return }
                let keys = hardwareKeyboard.pendingInputMethodKeys
                hardwareKeyboard.pendingInputMethodKeys.removeAll()

                // The system never handed these presses to the input method
                // on its own — calibrate to forwarding, and give these very
                // presses to the text input system right now: the input
                // method can still compose them, so nothing leaks into the
                // shell. Only keys whose forward has already been tried fall
                // through to the raw replay below.
                let retriable = keys.filter { !$0.forwardAttempted }
                if !retriable.isEmpty {
                    if !HardwareKeyboardState.inputMethodNeedsPressForwarding {
                        HardwareKeyboardState.inputMethodNeedsPressForwarding = true
                        TerminalDebugLog.log(
                            .input,
                            "text input system ignored the loan; forwarding deferred presses to the text input system from now on",
                        )
                    }
                    hardwareKeyboard.pendingInputMethodKeys = keys.map { key in
                        var retried = key
                        retried.forwardAttempted = true
                        return retried
                    }
                    for key in retriable {
                        guard let press = key.press else { continue }
                        if hardwareKeyboard.pressesLoanedToInputMethod.contains(press) {
                            // Still held down: its ended will complete at the
                            // text input system through the forwarded set.
                            hardwareKeyboard.pressesForwardedToInputMethod.insert(press)
                            forwardPressesToTextInputSystem([press], phase: .began, with: nil)
                        } else {
                            // Already released — hand the text input system
                            // the whole pair so the input method sees a full
                            // press.
                            forwardPressesToTextInputSystem([press], phase: .began, with: nil)
                            forwardPressesToTextInputSystem([press], phase: .ended, with: nil)
                        }
                    }
                    // The claim decides their fate — and it round-trips the
                    // keyboard daemon, so give it real time instead of one
                    // runloop turn. Costs a one-time delay on the process's
                    // first key when no input method is listening at all.
                    scheduleInputMethodKeyFlush(after: 0.25)
                    return
                }

                // A responsive input method never gets keys replayed behind
                // its back: its claims arrive asynchronously (a key we
                // replay now may be mid-composition and would type twice),
                // and a key it consumes without any mutation — candidate
                // paging — is its to consume. The same goes for a visibly
                // live composition even before the first claim.
                guard !HardwareKeyboardState.inputMethodProvenResponsive,
                      !inputHandler.hasMarkedText
                else {
                    TerminalDebugLog.log(
                        .input,
                        "dropping \(keys.count) unclaimed key(s): input method owns them (proven=\(HardwareKeyboardState.inputMethodProvenResponsive) marked=\(inputHandler.hasMarkedText))",
                    )
                    return
                }

                guard surface != nil else { return }
                TerminalDebugLog.log(
                    .input,
                    "input method left \(keys.count) key(s) unclaimed, replaying",
                )
                hardwareKeyboard.replayedKeysAwaitingClaim = true
                for key in keys {
                    var keyEvent = ghostty_input_key_s()
                    keyEvent.action = key.action
                    keyEvent.mods = key.mods
                    keyEvent.keycode = key.keycode
                    keyEvent.consumed_mods = key.consumedMods
                    keyEvent.unshifted_codepoint = key.unshiftedCodepoint
                    keyEvent.composing = false
                    if let text = key.text, !text.isEmpty {
                        text.withCString { ptr in
                            keyEvent.text = ptr
                            _ = sendInputKeyEvent(keyEvent)
                        }
                    } else {
                        _ = sendInputKeyEvent(keyEvent)
                    }
                    // The matching release: pressesEnded skips loaned
                    // presses, so the pair completes here.
                    var release = keyEvent
                    release.action = GHOSTTY_ACTION_RELEASE
                    release.text = nil
                    _ = sendInputKeyEvent(release)
                }
            }
        }
    #endif

    // MARK: - Key repeat

    /// UIKit sends one `pressesBegan` for a held key and nothing more until
    /// it goes up; the repeat is the text input system's, and it does not
    /// reach the terminal for every key. On iOS it only produces one for a
    /// key that reached it, and the terminal keeps every key off that path
    /// (it would echo each one back as `insertText` / `deleteBackward`), so
    /// a held key — Delete, an arrow, a letter — typed exactly once. On Mac
    /// Catalyst it repeats every key that types text, but a held arrow,
    /// Home or F5 typed once all the same: the text input system spends
    /// those repeats on moves through the UITextInput document. The repeat
    /// is generated here instead, as `GHOSTTY_ACTION_REPEAT` events, which
    /// both of ghostty's key encoders write like a press (and the Kitty one
    /// reports as a repeat when the program asked for event types) — on
    /// Catalyst only for a key that types no text, since a repeat generated
    /// on top of the system's would type every held character twice.
    extension UITerminalView {
        /// Starts repeating the key `press` just sent, when
        /// `TerminalKeyRepeat` says it repeats.
        func startKeyRepeat(for press: UIPress) {
            guard let key = press.key else { return }
            let modifierFlags = filteredModifierFlags(for: key)
            #if targetEnvironment(macCatalyst)
                let isRepeatedBySystem = TerminalKeyRepeat.typesText(
                    charactersIgnoringModifiers: key.charactersIgnoringModifiers,
                )
            #else
                let isRepeatedBySystem = false
            #endif
            guard TerminalKeyRepeat.repeats(
                usage: UInt16(key.keyCode.rawValue),
                isCommandModified: modifierFlags.contains(.command),
                isKeyCommand: keyCommandInput(for: key, filteredModifierFlags: modifierFlags) != nil,
                isRepeatedBySystem: isRepeatedBySystem,
            ) else { return }

            stopKeyRepeat()
            let timing = keyRepeatTiming
            let timer = Timer(
                fire: Date(timeIntervalSinceNow: timing.initialDelay),
                interval: timing.interval,
                repeats: true,
            ) { [weak self] timer in
                guard let self else { return timer.invalidate() }
                MainActor.assumeIsolated {
                    self.sendKeyRepeat()
                }
            }
            // `.common`, so a repeat keeps going while a scroll is
            // tracking.
            RunLoop.main.add(timer, forMode: .common)
            hardwareKeyboard.keyRepeat = .init(press: press, timer: timer)
        }

        func stopKeyRepeat() {
            hardwareKeyboard.keyRepeat?.timer.invalidate()
            hardwareKeyboard.keyRepeat = nil
        }

        private func sendKeyRepeat() {
            // The release normally ends the repeat. Should it never
            // arrive, losing focus or the surface still does, instead of
            // a key that types forever — and so do keys going to another
            // window: on the Mac the view stays its own window's first
            // responder while another window or app has the keyboard, and
            // the release goes there.
            guard let key = hardwareKeyboard.keyRepeat?.press.key,
                  isFirstResponder,
                  isTakingHardwareKeys,
                  surface != nil
            else { return stopKeyRepeat() }
            handleKeyPress(key, action: GHOSTTY_ACTION_REPEAT)
        }

        /// Whether hardware keys come to this view's window: the key window
        /// of a scene the user is in.
        private var isTakingHardwareKeys: Bool {
            guard let window, window.isKeyWindow else { return false }
            return (window.windowScene?.activationState ?? .foregroundActive) == .foregroundActive
        }

        /// On the Mac, the user's Key Repeat setting, read off AppKit's
        /// `NSEvent` — loaded in every Catalyst process, though not
        /// importable from one. iOS exposes the setting to no app.
        private var keyRepeatTiming: (initialDelay: TimeInterval, interval: TimeInterval) {
            #if targetEnvironment(macCatalyst)
                let event: AnyObject? = NSClassFromString("NSEvent")
                func read(_ name: String) -> TimeInterval? {
                    guard let event, event.responds(to: NSSelectorFromString(name)) else { return nil }
                    return event.value(forKey: name) as? TimeInterval
                }
                return TerminalKeyRepeat.timing(
                    systemDelay: read("keyRepeatDelay"),
                    systemInterval: read("keyRepeatInterval"),
                )
            #else
                return (TerminalKeyRepeat.initialDelay, TerminalKeyRepeat.interval)
            #endif
        }
    }
#endif
