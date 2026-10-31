//
//  AppTerminalView+PublicInput.swift
//  libghostty-spm
//
//  Public wrappers around `TerminalSurface` write paths so hosts can
//  inject bytes into the pty without reaching for internal API.
//

#if !canImport(UIKit) && canImport(AppKit)
    import AppKit
    import GhosttyKit

    public extension AppTerminalView {
        /// Make this view the window's first responder, reporting whether
        /// keyboard focus was actually acquired. Fails (returns false) while
        /// the view is not in a window; ``TerminalViewState/requestFocus()``
        /// retries then on window attach.
        @discardableResult
        func acquireProgrammaticFocus() -> Bool {
            guard let window else { return false }
            if window.firstResponder === self {
                return true
            }
            return window.makeFirstResponder(self)
        }

        /// Paste text into the terminal. This is the text path: a program
        /// that enabled bracketed paste receives it framed as a paste, so
        /// escape sequences and a `\r` in it are pasted characters, not
        /// keys. Keystrokes — Shift+Tab, Enter, Ctrl+C — go through
        /// ``sendKey(_:)``. False when the surface has not been created yet.
        @discardableResult
        func paste(text: String) -> Bool {
            surface?.paste(text: text) ?? false
        }

        /// Presses and releases a key, as if typed on a hardware keyboard —
        /// see ``TerminalSurface/sendKey(_:)``. An open IME composition is
        /// committed first, as it would be ahead of a hardware key. False
        /// with no surface yet.
        @discardableResult
        func sendKey(_ press: TerminalKeyPress) -> Bool {
            guard let surface else { return false }
            if hasMarkedText() {
                inputHandler?.inputMethodHandler?.commitMarkedText()
                // The input method keeps its own copy of the composition and
                // would re-mark it on the next keystroke.
                inputContext?.discardMarkedText()
            }
            return surface.sendKey(press)
        }

        /// ``sendKey(_:)`` for a key and its modifiers: `sendKey(.enter)`,
        /// `sendKey(.tab, modifiers: .shift)`.
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
