//
//  TerminalPointerPolicy.swift
//  libghostty-spm
//
//  Host-side pointer decisions that must stay out of Ghostty: which
//  physical button maps to which C enum, whether the copy menu may
//  steal a secondary click, and press/release pairing so a cancel
//  cannot leave a stuck button.
//

import GhosttyKit

enum TerminalPointerPolicy {
    /// `ghostty.h` numbers extra buttons as FOUR=4 … ELEVEN=11, matching
    /// UIKit's one-based `UIEvent.ButtonMask.button(n)` for n ≥ 4.
    static let extraButtonRange = 4 ... 11

    static func ghosttyButton(
        secondary: Bool,
        middle: Bool,
        extraButtonNumber: Int? = nil,
    ) -> ghostty_input_mouse_button_e {
        if secondary {
            return GHOSTTY_MOUSE_RIGHT
        }
        if middle {
            return GHOSTTY_MOUSE_MIDDLE
        }
        if let extra = extraButtonNumber, extraButtonRange.contains(extra) {
            return ghostty_input_mouse_button_e(rawValue: UInt32(extra))
        }
        return GHOSTTY_MOUSE_LEFT
    }

    static func shouldPresentHostSecondaryMenu(mouseCaptured: Bool) -> Bool {
        !mouseCaptured
    }
}

/// At most one Ghostty-visible mouse button. `press` is ignored while a
/// button is already reported. `release` is ignored unless it matches.
/// `cancel` / `finish` release whatever is reported, once.
struct TerminalPointerButtonSession: Equatable {
    private(set) var reported: ghostty_input_mouse_button_e?

    mutating func press(
        _ button: ghostty_input_mouse_button_e,
    ) -> ghostty_input_mouse_button_e? {
        guard reported == nil else { return nil }
        reported = button
        return button
    }

    mutating func release(
        _ button: ghostty_input_mouse_button_e,
    ) -> ghostty_input_mouse_button_e? {
        guard reported == button else { return nil }
        reported = nil
        return button
    }

    mutating func finish() -> ghostty_input_mouse_button_e? {
        guard let button = reported else { return nil }
        reported = nil
        return button
    }

    mutating func cancel() -> ghostty_input_mouse_button_e? {
        finish()
    }
}
