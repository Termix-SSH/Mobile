//
//  TerminalFontSizeAction.swift
//  libghostty-spm
//

import Foundation

/// One of Ghostty's four font-size binding actions, recognized from the two
/// places they reach a surface: a binding-action string, and a Cmd key press
/// that Ghostty's default keybinds turn into one.
enum TerminalFontSizeAction: Equatable {
    case increase(Float)
    case decrease(Float)
    case set(Float)
    case reset

    /// Parses an action string the way Ghostty's `Binding.Action.parse`
    /// does for these four: the name, then a colon and an `f32` for the
    /// three that take one; `reset_font_size` takes none and is rejected
    /// with a colon. Nil for every other action and for a malformed one —
    /// Ghostty refuses those too, so nothing changed. NaN is refused here
    /// though Zig parses it: what Ghostty's clamps make of it is not worth
    /// guessing, and nobody zooms by NaN.
    init?(bindingAction: String) {
        let parts = bindingAction.split(
            separator: ":",
            maxSplits: 1,
            omittingEmptySubsequences: false,
        )
        let name = parts[0]
        guard parts.count == 2 else {
            guard name == "reset_font_size" else { return nil }
            self = .reset
            return
        }
        guard let value = Float(parts[1]), !value.isNaN else { return nil }
        switch name {
        case "increase_font_size": self = .increase(value)
        case "decrease_font_size": self = .decrease(value)
        case "set_font_size": self = .set(value)
        default: return nil
        }
    }

    /// The action a Cmd key press runs under Ghostty's default keybinds
    /// (`super+=` and `super++` increase by 1, `super+-` decreases by 1,
    /// `super+0` resets), from the key's characters with and without its
    /// modifiers — whichever of them names the key. The caller has already
    /// established that Cmd is held. `_` counts as `-`, as it did in the
    /// UIKit counter this replaced; Ghostty, not this table, decides whether
    /// the press is a binding at all (`TerminalSurface.sendKeyEvent` asks).
    init?(commandKeyCharacters candidates: [String?]) {
        if candidates.contains(where: { $0 == "+" || $0 == "=" }) {
            self = .increase(1)
        } else if candidates.contains(where: { $0 == "-" || $0 == "_" }) {
            self = .decrease(1)
        } else if candidates.contains("0") {
            self = .reset
        } else {
            return nil
        }
    }
}
