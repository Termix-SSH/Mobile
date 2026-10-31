//
//  TerminalKeyPress.swift
//  libghostty-spm
//

import GhosttyKit

/// One key pressed with a set of modifiers, the way a host presses a key
/// programmatically.
///
/// libghostty has two ways in: the key path (`ghostty_surface_key`), which
/// the core's key encoder turns into whatever the terminal's mode asks for
/// — legacy bytes, modifyOtherKeys, kitty — and the text path
/// (`ghostty_surface_text`), which is a paste. A pasted `\r` under
/// bracketed paste is text in the shell's edit line, not Enter. Keystrokes
/// therefore go here; only clipboard content belongs in
/// ``TerminalSurface/paste(text:)``.
public struct TerminalKeyPress: Sendable, Hashable {
    public var key: TerminalKey
    public var modifiers: TerminalInputModifiers

    public init(_ key: TerminalKey, modifiers: TerminalInputModifiers = []) {
        self.key = key
        self.modifiers = modifiers
    }

    /// The press that types `character` on a US layout, Shift included when
    /// the character needs it: `"C"` is `c` with Shift, `"~"` is the
    /// backquote key with Shift. Nil for a character no US key types.
    public init?(typing character: Character, modifiers: TerminalInputModifiers = []) {
        guard let match = TerminalKey.usLayoutKey(typing: character) else { return nil }
        key = match.key
        self.modifiers = match.shifted ? modifiers.union(.shift) : modifiers
    }

    /// The text this press types, from the US layout: the shifted
    /// character under Shift, else the unshifted one; nil for a key that
    /// types nothing. Omitted under Command, as the hardware paths do —
    /// libghostty's macOS build ignores text on a Command chord, its iOS
    /// build would type it.
    public var text: String? {
        guard !modifiers.contains(.super_), !modifiers.contains(.superRight),
              let characters = key.usLayoutCharacters
        else { return nil }
        if modifiers.contains(.shift) || modifiers.contains(.shiftRight),
           let shifted = characters.shifted
        {
            return String(shifted)
        }
        return String(characters.unshifted)
    }

    /// The codepoint the key types with no modifier at all — what the kitty
    /// encoder reports, and what the legacy encoder derives Ctrl bytes
    /// from. Zero for a key that types nothing.
    public var unshiftedCodepoint: UInt32 {
        key.usLayoutCharacters?.unshifted.unicodeScalars.first?.value ?? 0
    }

    /// Builds the libghostty event and hands it to `body` while the text
    /// buffer is alive.
    func withKeyEvent<Result>(
        action: ghostty_input_action_e,
        _ body: (ghostty_input_key_s) -> Result,
    ) -> Result {
        var event = ghostty_input_key_s()
        event.action = action
        event.keycode = TerminalHardwareKeyRouter.appKitKeyCode(for: key.ghosttyKey)
        event.mods = modifiers.ghosttyMods
        // Only Shift produced the text (the US table knows no Option
        // layer), so only Shift is spent; Control, Alt and Command stay
        // visible to the encoder — libghostty strips consumed modifiers
        // before deciding on Ctrl bytes and the Alt ESC prefix.
        event.consumed_mods = modifiers
            .intersection([.shift, .shiftRight])
            .ghosttyMods
        event.unshifted_codepoint = unshiftedCodepoint
        event.composing = false

        // Only the press carries text; a release types nothing.
        guard action == GHOSTTY_ACTION_PRESS || action == GHOSTTY_ACTION_REPEAT,
              let text
        else {
            return body(event)
        }
        return text.withCString { pointer in
            event.text = pointer
            return body(event)
        }
    }
}

public extension TerminalSurface {
    /// Presses and releases a key, as if typed on a hardware keyboard: the
    /// event takes the key path, so the terminal's key encoding applies and
    /// it is never paste-framed. Returns whether the press was accepted —
    /// false with no surface, and for a ``TerminalKey`` that has no macOS
    /// keycode for libghostty to resolve (``TerminalKey/hasPlatformKeycode``).
    ///
    /// The release follows the press so a program on the kitty keyboard
    /// protocol with event reporting never sees a key held down; in the
    /// legacy encoding a release encodes nothing.
    @discardableResult
    func sendKey(_ press: TerminalKeyPress) -> Bool {
        guard press.key.hasPlatformKeycode else {
            TerminalDebugLog.log(
                .input,
                "surface key ignored: \(press.key) has no platform keycode",
            )
            return false
        }
        let pressed = press.withKeyEvent(action: GHOSTTY_ACTION_PRESS) { event in
            sendKeyEvent(event)
        }
        _ = press.withKeyEvent(action: GHOSTTY_ACTION_RELEASE) { event in
            sendKeyEvent(event)
        }
        return pressed
    }

    /// ``sendKey(_:)`` for a key and its modifiers: `sendKey(.enter)`,
    /// `sendKey(.c, modifiers: .ctrl)`, `sendKey(.tab, modifiers: .shift)`.
    @discardableResult
    func sendKey(_ key: TerminalKey, modifiers: TerminalInputModifiers = []) -> Bool {
        sendKey(TerminalKeyPress(key, modifiers: modifiers))
    }
}
