//
//  TerminalSurface+FontSize.swift
//  libghostty-spm
//

import Foundation
import GhosttyKit

extension TerminalSurface {
    /// The font-size binding a key press runs, if it runs one. Every key on
    /// both platforms — hardware presses, a host's `sendKey` — reaches the
    /// surface through `sendKeyEvent`, so this is the one place a Cmd+=/-/0
    /// can be seen whatever sent it. The zooming itself is Ghostty's own
    /// keybinds, on every platform.
    ///
    /// The C API says whether a key is a binding but not which action it
    /// runs, so the action comes from the key's characters
    /// (`TerminalFontSizeAction(commandKeyCharacters:)`, the default
    /// keybinds), and counts only when Ghostty confirms the key is bound.
    /// The key being reported handled is not enough: under the kitty
    /// keyboard protocol an unbound Cmd key is encoded for the program and
    /// reported handled too, and a Cmd+_ or a config that drops the default
    /// keybinds must leave the size alone, as Ghostty does.
    func fontSizeAction(forKey event: ghostty_input_key_s) -> TerminalFontSizeAction? {
        guard event.action == GHOSTTY_ACTION_PRESS || event.action == GHOSTTY_ACTION_REPEAT else {
            return nil
        }
        let modifiers = TerminalInputModifiers(rawValue: event.mods.rawValue)
        guard !modifiers.isDisjoint(with: [.super_, .superRight]) else { return nil }

        let text = event.text.map { String(cString: $0) }
        let unshifted = Unicode.Scalar(event.unshifted_codepoint).map { String($0) }
        guard let action = TerminalFontSizeAction(commandKeyCharacters: [text, unshifted]),
              let rawValue
        else {
            return nil
        }

        var flags = ghostty_binding_flags_e(rawValue: 0)
        guard ghostty_surface_key_is_binding(rawValue, event, &flags) else { return nil }
        return action
    }
}
