import Foundation

/// Which held hardware keys the view repeats itself, and how fast. UIKit
/// reports a held key once; the repeat belongs to the text input system.
/// On iOS the terminal's keys never reach it. On Mac Catalyst it repeats
/// every key that types text, as `insertText` / `deleteBackward`, and turns
/// the repeats of the others — an arrow, Home, F5 — into moves through the
/// UITextInput document, which holds no text, so they never reach the
/// terminal.
enum TerminalKeyRepeat {
    /// iPadOS exposes the user's Key Repeat setting to no app, so these
    /// follow AppKit's defaults.
    static let initialDelay: TimeInterval = 0.4
    static let interval: TimeInterval = 0.05

    /// Caps Lock and the eight modifier usages (HID 0xE0–0xE7). Holding one
    /// is not typing, and pressing one leaves a running repeat alone.
    static func isModifier(usage: UInt16) -> Bool {
        usage == 0x39 || (0xE0 ... 0xE7).contains(usage)
    }

    /// Whether a held key repeats. A Cmd combo is a shortcut, not typing.
    /// A key that is also a registered `UIKeyCommand` (the Ctrl combos,
    /// Escape) is delivered by that command — a repeat of its press would
    /// double the command's own, or repeat a press the claim dropped. A key
    /// the system already repeats (`isRepeatedBySystem`) would type every
    /// held character twice.
    static func repeats(
        usage: UInt16,
        isCommandModified: Bool,
        isKeyCommand: Bool,
        isRepeatedBySystem: Bool,
    ) -> Bool {
        !isModifier(usage: usage) && !isCommandModified && !isKeyCommand && !isRepeatedBySystem
    }

    /// Whether a key types text, judged by its characters ignoring
    /// modifiers. A function key — named by UIKit (`UIKeyInputLeftArrow`)
    /// or a private-use scalar (U+F702) — types none, and neither does a
    /// key that reports no characters at all.
    static func typesText(charactersIgnoringModifiers: String?) -> Bool {
        guard let text = TerminalInputText.filteredFunctionKeyText(charactersIgnoringModifiers) else {
            return false
        }
        return !text.isEmpty
    }

    /// The delay and interval to repeat at, given the user's own Key Repeat
    /// setting where the platform exposes it (AppKit's `NSEvent`, on Mac
    /// Catalyst). The system repeats every text key at that pace, so an
    /// arrow keeps step with a letter. No setting, or one that is not a
    /// positive duration, falls back to the fixed timing.
    static func timing(
        systemDelay: TimeInterval?,
        systemInterval: TimeInterval?,
    ) -> (initialDelay: TimeInterval, interval: TimeInterval) {
        guard let systemDelay, let systemInterval,
              systemDelay.isFinite, systemDelay > 0,
              systemInterval.isFinite, systemInterval > 0
        else { return (initialDelay, interval) }
        return (systemDelay, systemInterval)
    }
}
