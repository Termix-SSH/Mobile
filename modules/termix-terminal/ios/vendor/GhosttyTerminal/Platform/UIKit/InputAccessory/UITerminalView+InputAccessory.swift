//
//  UITerminalView+InputAccessory.swift
//  libghostty-spm
//

#if canImport(UIKit)
    #if !targetEnvironment(macCatalyst)
        import GhosttyKit
        import UIKit

        extension UITerminalView {
            // visionOS has no input accessory view: the software keyboard is its
            // own window in the space, and UIKit does not offer the override.
            // Hosts there draw a bar of their own and feed it through
            // `+PublicSticky` / `sendKey`, as a Catalyst host does.
            #if !os(visionOS)
                override open var inputAccessoryView: UIView? {
                    inputAccessoryItems.isEmpty ? nil : terminalInputAccessory
                }
            #endif

            func handleInputBarKey(_ key: TerminalInputBarKey) {
                commitMarkedTextIfStickyModifiersAreActive()

                switch key {
                case let .symbol(text):
                    _ = handleStickyTextInput(text)

                case .paste:
                    // Clipboard content, so the text path (bracketed paste) —
                    // see "Key Path vs Text Path" in AGENTS.md.
                    _ = stickyModifiers.consumeForNextKey()
                    pasteFromPasteboard()

                case .esc:
                    let mods = stickyModifiers.consumeForNextKey()
                    sendSyntheticKey(usage: 0x29, additionalMods: mods)

                case .tab:
                    let mods = stickyModifiers.consumeForNextKey()
                    sendSyntheticKey(usage: 0x2B, additionalMods: mods)

                case .arrowLeft:
                    let mods = stickyModifiers.consumeForNextKey()
                    sendSyntheticKey(usage: 0x50, additionalMods: mods)

                case .arrowRight:
                    let mods = stickyModifiers.consumeForNextKey()
                    sendSyntheticKey(usage: 0x4F, additionalMods: mods)

                case .arrowUp:
                    let mods = stickyModifiers.consumeForNextKey()
                    sendSyntheticKey(usage: 0x52, additionalMods: mods)

                case .arrowDown:
                    let mods = stickyModifiers.consumeForNextKey()
                    sendSyntheticKey(usage: 0x51, additionalMods: mods)
                }
            }

            private func commitMarkedTextIfStickyModifiersAreActive() {
                guard stickyModifiers.hasActiveModifiers, inputHandler.hasMarkedText else { return }
                inputHandler.unmarkText(applyingStickyModifiers: false)
            }

            func sendSyntheticKey(
                usage: UInt16,
                additionalMods: TerminalInputModifiers = [],
            ) {
                guard surface != nil else { return }

                if inputHandler.hasMarkedText {
                    inputHandler.unmarkText()
                }

                var event = ghostty_input_key_s()
                event.action = GHOSTTY_ACTION_PRESS
                event.keycode = TerminalHardwareKeyRouter.appKitKeyCode(
                    for: TerminalHardwareKeyRouter.ghosttyKey(forUIKitUsage: usage),
                )
                event.mods = additionalMods.ghosttyMods
                _ = sendInputKeyEvent(event)
                sendSyntheticRelease(for: event)
            }

            /// The matching release for a synthetic press, so a program on the
            /// kitty protocol with event reporting never sees the key held
            /// down — the same pairing `TerminalSurface.sendKey` guarantees.
            func sendSyntheticRelease(for press: ghostty_input_key_s) {
                guard surface != nil else { return }
                var release = press
                release.action = GHOSTTY_ACTION_RELEASE
                release.text = nil
                _ = sendInputKeyEvent(release)
            }

            @discardableResult
            func handleStickyTextInput(_ text: String) -> Bool {
                handleStickyTextInput(text) { [weak self] text in
                    self?.inputHandler.insertText(text)
                }
            }

            @discardableResult
            func handleStickyCommittedText(_ text: String) -> Bool {
                handleStickyTextInput(text) { [weak self] text in
                    self?.paste(text: text)
                }
            }

            @discardableResult
            func handleStickyMarkedText(_ text: String) -> Bool {
                guard stickyModifiers.hasActiveModifiers else { return false }

                let keyText = String(text.prefix(1))
                let mods = stickyModifiers.consumeForNextKey()
                if mods == .ctrl, let controlByte = controlByte(for: keyText) {
                    sendControlByte(controlByte, modifiers: mods)
                    return true
                }
                return sendModifiedTextKey(keyText, modifiers: mods)
            }

            @discardableResult
            private func handleStickyTextInput(
                _ text: String,
                fallback: (String) -> Void,
            ) -> Bool {
                commitMarkedTextIfStickyModifiersAreActive()

                guard stickyModifiers.hasActiveModifiers else {
                    fallback(text)
                    return false
                }

                let mods = stickyModifiers.consumeForNextKey()
                if mods == .ctrl, let controlByte = controlByte(for: text) {
                    sendControlByte(controlByte, modifiers: mods)
                    return true
                }

                if sendModifiedTextKey(text, modifiers: mods) {
                    return true
                }

                fallback(text)
                return false
            }

            func sendControlByte(
                _ byte: UInt8,
                modifiers: TerminalInputModifiers = .ctrl,
            ) {
                if inputHandler.hasMarkedText {
                    inputHandler.unmarkText()
                }

                guard surface != nil else { return }
                var event = ghostty_input_key_s()
                event.action = GHOSTTY_ACTION_PRESS
                event.mods = modifiers.ghosttyMods
                let scalar = UnicodeScalar(byte | 0x60)
                let ghosttyKey = ghosttyKeyForCharacter(Character(scalar))
                event.keycode = TerminalHardwareKeyRouter.appKitKeyCode(
                    for: ghosttyKey,
                )
                // The kitty encoder keys `CSI <cp>;<mods>u` off this and drops
                // the press without it (see "Key Path vs Text Path" in AGENTS.md).
                event.unshifted_codepoint = scalar.value
                _ = sendInputKeyEvent(event)
                sendSyntheticRelease(for: event)
            }

            private func controlByte(for text: String) -> UInt8? {
                guard text.count == 1 else { return nil }
                guard let ascii = text.lowercased().utf8.first else { return nil }
                guard ascii >= 0x61, ascii <= 0x7A else { return nil }
                return ascii & 0x1F
            }

            /// Not sticky-modifier logic — a plain "character + held modifiers →
            /// one key event" synthesizer; the hardware key-command fallback
            /// (UITerminalView+Keyboard) sends through it too.
            func sendModifiedTextKey(
                _ text: String,
                modifiers: TerminalInputModifiers,
            ) -> Bool {
                guard surface != nil else { return false }

                if inputHandler.hasMarkedText {
                    inputHandler.unmarkText()
                }

                guard let mapping = keyMapping(for: text) else { return false }

                var event = ghostty_input_key_s()
                event.action = GHOSTTY_ACTION_PRESS
                event.keycode = TerminalHardwareKeyRouter.appKitKeyCode(
                    for: mapping.key,
                )
                event.mods = modifiers.union(mapping.extraModifiers).ghosttyMods
                // See `sendControlByte`: the kitty encoder keys its CSI u
                // sequence off this, not the keycode.
                event.unshifted_codepoint = mapping.unshifted.value

                if !modifiers.contains(.super_) {
                    text.withCString { ptr in
                        event.text = ptr
                        _ = sendInputKeyEvent(event)
                    }
                } else {
                    _ = sendInputKeyEvent(event)
                }
                sendSyntheticRelease(for: event)

                return true
            }

            /// The US-layout key that types `text`, the modifier it needs, and
            /// what the same key types with no modifier at all — the codepoint
            /// the kitty encoder reports.
            private func keyMapping(
                for text: String,
            ) -> (key: ghostty_input_key_e, extraModifiers: TerminalInputModifiers, unshifted: UnicodeScalar)? {
                guard text.count == 1, let char = text.first, let scalar = char.unicodeScalars.first else {
                    return nil
                }
                switch char {
                case "a" ... "z":
                    return (ghosttyKeyForCharacter(char), [], scalar)
                case "A" ... "Z":
                    let lowercase = Character(char.lowercased())
                    return (ghosttyKeyForCharacter(lowercase), [.shift], lowercase.unicodeScalars.first ?? scalar)
                case "0": return (GHOSTTY_KEY_DIGIT_0, [], scalar)
                case "1": return (GHOSTTY_KEY_DIGIT_1, [], scalar)
                case "2": return (GHOSTTY_KEY_DIGIT_2, [], scalar)
                case "3": return (GHOSTTY_KEY_DIGIT_3, [], scalar)
                case "4": return (GHOSTTY_KEY_DIGIT_4, [], scalar)
                case "5": return (GHOSTTY_KEY_DIGIT_5, [], scalar)
                case "6": return (GHOSTTY_KEY_DIGIT_6, [], scalar)
                case "7": return (GHOSTTY_KEY_DIGIT_7, [], scalar)
                case "8": return (GHOSTTY_KEY_DIGIT_8, [], scalar)
                case "9": return (GHOSTTY_KEY_DIGIT_9, [], scalar)
                case ")": return (GHOSTTY_KEY_DIGIT_0, [.shift], "0")
                case "!": return (GHOSTTY_KEY_DIGIT_1, [.shift], "1")
                case "@": return (GHOSTTY_KEY_DIGIT_2, [.shift], "2")
                case "#": return (GHOSTTY_KEY_DIGIT_3, [.shift], "3")
                case "$": return (GHOSTTY_KEY_DIGIT_4, [.shift], "4")
                case "%": return (GHOSTTY_KEY_DIGIT_5, [.shift], "5")
                case "^": return (GHOSTTY_KEY_DIGIT_6, [.shift], "6")
                case "&": return (GHOSTTY_KEY_DIGIT_7, [.shift], "7")
                case "*": return (GHOSTTY_KEY_DIGIT_8, [.shift], "8")
                case "(": return (GHOSTTY_KEY_DIGIT_9, [.shift], "9")
                case "`": return (GHOSTTY_KEY_BACKQUOTE, [], scalar)
                case "~": return (GHOSTTY_KEY_BACKQUOTE, [.shift], "`")
                case "-": return (GHOSTTY_KEY_MINUS, [], scalar)
                case "_": return (GHOSTTY_KEY_MINUS, [.shift], "-")
                case "=": return (GHOSTTY_KEY_EQUAL, [], scalar)
                case "+": return (GHOSTTY_KEY_EQUAL, [.shift], "=")
                case "[": return (GHOSTTY_KEY_BRACKET_LEFT, [], scalar)
                case "{": return (GHOSTTY_KEY_BRACKET_LEFT, [.shift], "[")
                case "]": return (GHOSTTY_KEY_BRACKET_RIGHT, [], scalar)
                case "}": return (GHOSTTY_KEY_BRACKET_RIGHT, [.shift], "]")
                case "\\": return (GHOSTTY_KEY_BACKSLASH, [], scalar)
                case "|": return (GHOSTTY_KEY_BACKSLASH, [.shift], "\\")
                case ";": return (GHOSTTY_KEY_SEMICOLON, [], scalar)
                case ":": return (GHOSTTY_KEY_SEMICOLON, [.shift], ";")
                case "'": return (GHOSTTY_KEY_QUOTE, [], scalar)
                case "\"": return (GHOSTTY_KEY_QUOTE, [.shift], "'")
                case ",": return (GHOSTTY_KEY_COMMA, [], scalar)
                case "<": return (GHOSTTY_KEY_COMMA, [.shift], ",")
                case ".": return (GHOSTTY_KEY_PERIOD, [], scalar)
                case ">": return (GHOSTTY_KEY_PERIOD, [.shift], ".")
                case "/": return (GHOSTTY_KEY_SLASH, [], scalar)
                case "?": return (GHOSTTY_KEY_SLASH, [.shift], "/")
                case " ": return (GHOSTTY_KEY_SPACE, [], scalar)
                default:
                    return nil
                }
            }

            private func ghosttyKeyForCharacter(_ char: Character) -> ghostty_input_key_e {
                switch char {
                case "a": GHOSTTY_KEY_A
                case "b": GHOSTTY_KEY_B
                case "c": GHOSTTY_KEY_C
                case "d": GHOSTTY_KEY_D
                case "e": GHOSTTY_KEY_E
                case "f": GHOSTTY_KEY_F
                case "g": GHOSTTY_KEY_G
                case "h": GHOSTTY_KEY_H
                case "i": GHOSTTY_KEY_I
                case "j": GHOSTTY_KEY_J
                case "k": GHOSTTY_KEY_K
                case "l": GHOSTTY_KEY_L
                case "m": GHOSTTY_KEY_M
                case "n": GHOSTTY_KEY_N
                case "o": GHOSTTY_KEY_O
                case "p": GHOSTTY_KEY_P
                case "q": GHOSTTY_KEY_Q
                case "r": GHOSTTY_KEY_R
                case "s": GHOSTTY_KEY_S
                case "t": GHOSTTY_KEY_T
                case "u": GHOSTTY_KEY_U
                case "v": GHOSTTY_KEY_V
                case "w": GHOSTTY_KEY_W
                case "x": GHOSTTY_KEY_X
                case "y": GHOSTTY_KEY_Y
                case "z": GHOSTTY_KEY_Z
                default: GHOSTTY_KEY_UNIDENTIFIED
                }
            }
        }
    #endif
#endif
