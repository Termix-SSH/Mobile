//
//  UITerminalView+Input.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import GhosttyKit
    import UIKit

    extension UITerminalView {
        /// Dispatch a complete key whose modifiers have already been resolved.
        /// Hardware key commands must not consume the accessory's sticky state.
        @discardableResult
        func sendInputKey(_ press: TerminalKeyPress) -> Bool {
            guard press.key.hasPlatformKeycode else { return false }
            // A key command (Ctrl+C, Escape) is a key going down that
            // `pressesBegan` never saw; like any other, it ends the repeat
            // of a key still held.
            stopKeyRepeat()
            let handled = press.withKeyEvent(action: GHOSTTY_ACTION_PRESS) {
                sendInputKeyEvent($0, committingMarkedText: true)
            }
            _ = press.withKeyEvent(action: GHOSTTY_ACTION_RELEASE) { sendInputKeyEvent($0) }
            return handled
        }

        /// All view-owned key paths meet here after duplicate suppression and
        /// modifier resolution. The inline range belongs to the view, so Copy
        /// must read it before ordinary input dismisses it.
        @discardableResult
        func sendInputKeyEvent(
            _ event: ghostty_input_key_s,
            committingMarkedText: Bool = false,
        ) -> Bool {
            guard let surface else { return false }
            if event.action == GHOSTTY_ACTION_PRESS {
                hardwareKeyboard.touchCopyKeycodes.remove(event.keycode)
            } else if hardwareKeyboard.touchCopyKeycodes.contains(event.keycode) {
                if event.action == GHOSTTY_ACTION_RELEASE {
                    hardwareKeyboard.touchCopyKeycodes.remove(event.keycode)
                }
                return true
            }

            let isPress = event.action == GHOSTTY_ACTION_PRESS || event.action == GHOSTTY_ACTION_REPEAT
            let modifiers = TerminalInputModifiers(rawValue: event.mods.rawValue)
            let copy = isPress
                && !modifiers.isDisjoint(with: [.super_, .superRight])
                && modifiers.isDisjoint(with: [.ctrl, .ctrlRight, .alt, .altRight, .shift, .shiftRight])
                && (event.unshifted_codepoint == 99 || event.unshifted_codepoint == 67)
            // ⌘C over Ghostty's own selection (a pointer drag) copies the way
            // every other copy does (`TerminalCopyText`) rather than through
            // Ghostty's binding, which trims only trailing spaces.
            if copy, touchSelection.range == nil, surface.hasSelection() {
                _ = copySelectedTextToPasteboard()
                hardwareKeyboard.touchCopyKeycodes.insert(event.keycode)
                return true
            }

            if usesInlineTextSelection, isPress {
                if touchSelection.range != nil, copy {
                    _ = copyTouchSelection()
                    hardwareKeyboard.touchCopyKeycodes.insert(event.keycode)
                    return true
                }

                let key = TerminalHardwareKeyRouter.ghosttyKey(
                    forAppKitKeyCode: UInt16(clamping: event.keycode),
                )
                switch key {
                case GHOSTTY_KEY_SHIFT_LEFT, GHOSTTY_KEY_SHIFT_RIGHT,
                     GHOSTTY_KEY_CONTROL_LEFT, GHOSTTY_KEY_CONTROL_RIGHT,
                     GHOSTTY_KEY_ALT_LEFT, GHOSTTY_KEY_ALT_RIGHT,
                     GHOSTTY_KEY_META_LEFT, GHOSTTY_KEY_META_RIGHT, GHOSTTY_KEY_CAPS_LOCK:
                    break
                default:
                    dismissTouchSelection()
                }
            }
            if committingMarkedText, inputHandler.hasMarkedText {
                inputHandler.unmarkText()
            }
            return surface.sendKeyEvent(event)
        }
    }
#endif
