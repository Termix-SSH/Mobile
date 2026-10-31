//
//  UITerminalView+PublicInput.swift
//  libghostty-spm
//
//  Public wrappers around TerminalSurface input and navigation actions.
//

#if canImport(UIKit)
    import GhosttyKit
    import UIKit

    public extension UITerminalView {
        /// Make this view the first responder, reporting whether keyboard
        /// focus was actually acquired. Fails (returns false) while the view
        /// is not in a window; ``TerminalViewState/requestFocus()`` retries
        /// then on window attach.
        @discardableResult
        func acquireProgrammaticFocus() -> Bool {
            guard window != nil else { return false }
            if isFirstResponder {
                return true
            }
            return becomeFirstResponder()
        }

        /// Paste text into the terminal. This is the text path: a program
        /// that enabled bracketed paste receives it framed as a paste, so a
        /// `\r` in it is a pasted character, not Enter. Keystrokes go
        /// through ``sendKey(_:)``. False with no surface yet.
        @discardableResult
        func paste(text: String) -> Bool {
            dismissTouchSelection()
            return surface?.paste(text: text) ?? false
        }

        /// Presses and releases a key, as if typed on a hardware keyboard —
        /// see ``TerminalSurface/sendKey(_:)``. Armed sticky Ctrl/Alt/Cmd
        /// apply to the key and are spent by it, as on the bundled accessory
        /// bar. Cmd+C copies an inline selection; ordinary input clears it
        /// and commits any open IME composition. False with no surface yet.
        @discardableResult
        func sendKey(_ press: TerminalKeyPress) -> Bool {
            guard surface != nil else { return false }
            var press = press
            #if !targetEnvironment(macCatalyst)
                press.modifiers.formUnion(stickyModifiers.consumeForNextKey())
            #endif
            return sendInputKey(press)
        }

        /// ``sendKey(_:)`` for a key and its modifiers: `sendKey(.enter)`,
        /// `sendKey(.c, modifiers: .ctrl)`.
        @discardableResult
        func sendKey(_ key: TerminalKey, modifiers: TerminalInputModifiers = []) -> Bool {
            sendKey(TerminalKeyPress(key, modifiers: modifiers))
        }

        /// Invoke a named Ghostty binding action (e.g. "copy_to_clipboard",
        /// "clear_screen"). Returns true when the action dispatched. The four
        /// font-size actions (`increase_font_size:N`, `decrease_font_size:N`,
        /// `set_font_size:N`, `reset_font_size`) move ``fontSize``.
        @discardableResult
        func performBindingAction(_ action: String) -> Bool {
            surface?.performBindingAction(action) ?? false
        }

        /// The surface's font size in points, nil while there is no surface.
        /// Ghostty cannot report it, so the wrapper tracks every change it
        /// makes; ``TerminalSurfaceFontSizeDelegate`` hears each one.
        var fontSize: Float? {
            core.fontSize?.points
        }

        /// Jump the viewport by a number of shell prompts.
        ///
        /// Negative offsets move toward older prompts and positive offsets move
        /// toward newer prompts. Prompt navigation requires shell integration.
        @discardableResult
        func jumpToPrompt(by offset: Int16) -> Bool {
            surface?.jumpToPrompt(by: offset) ?? false
        }

        /// Reveal an absolute scrollback row, where zero is the first row.
        @discardableResult
        func scrollToRow(_ row: UInt) -> Bool {
            surface?.scrollToRow(row) ?? false
        }

        /// Whether the application currently owns the mouse.
        var isMouseCaptured: Bool {
            surface?.isMouseCaptured ?? false
        }

        /// View points. Ghostty applies content scale internally.
        func sendMousePos(
            x: Double,
            y: Double,
            modifiers: TerminalInputModifiers = [],
        ) {
            surface?.sendMousePos(x: x, y: y, modifiers: modifiers)
        }

        @discardableResult
        func sendMouseButton(
            state: ghostty_input_mouse_state_e,
            button: ghostty_input_mouse_button_e,
            modifiers: TerminalInputModifiers = [],
        ) -> Bool {
            surface?.sendMouseButton(
                state: state,
                button: button,
                modifiers: modifiers,
            ) ?? false
        }

        func sendMouseScroll(
            x: Double,
            y: Double,
            mods: TerminalScrollModifiers = TerminalScrollModifiers(precision: true),
        ) {
            surface?.sendMouseScroll(x: x, y: y, mods: mods)
        }
    }
#endif
