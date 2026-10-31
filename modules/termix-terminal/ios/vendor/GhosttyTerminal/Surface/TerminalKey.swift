//
//  TerminalKey.swift
//  libghostty-spm
//

import GhosttyKit

/// A physical key, named as the W3C UI Events `KeyboardEvent.code` value
/// names it — one case per `ghostty_input_key_e`, in the header's order
/// and sections. The set is complete on purpose: a host that wants to press
/// a key picks it from this list rather than from a hand-picked subset.
///
/// libghostty resolves a key from the platform's native keycode, and its
/// Apple builds use macOS virtual keycodes on every platform. A key with no
/// Mac keycode (``hasPlatformKeycode`` is false — the numpad extras, media
/// keys, IME mode keys) cannot be pressed programmatically; ``TerminalSurface/sendKey(_:)``
/// returns false for it.
public enum TerminalKey: Sendable, Hashable, CaseIterable {
    // "Writing System Keys" § 3.1.1
    case backquote
    case backslash
    case bracketLeft
    case bracketRight
    case comma
    case digit0
    case digit1
    case digit2
    case digit3
    case digit4
    case digit5
    case digit6
    case digit7
    case digit8
    case digit9
    case equal
    case intlBackslash
    case intlRo
    case intlYen
    case a
    case b
    case c
    case d
    case e
    case f
    case g
    case h
    case i
    case j
    case k
    case l
    case m
    case n
    case o
    case p
    case q
    case r
    case s
    case t
    case u
    case v
    case w
    case x
    case y
    case z
    case minus
    case period
    case quote
    case semicolon
    case slash

    // "Functional Keys" § 3.1.2
    case altLeft
    case altRight
    case backspace
    case capsLock
    case contextMenu
    case controlLeft
    case controlRight
    case enter
    case metaLeft
    case metaRight
    case shiftLeft
    case shiftRight
    case space
    case tab
    case convert
    case kanaMode
    case nonConvert

    // "Control Pad Section" § 3.2
    case delete
    case end
    case help
    case home
    case insert
    case pageDown
    case pageUp

    // "Arrow Pad Section" § 3.3
    case arrowDown
    case arrowLeft
    case arrowRight
    case arrowUp

    // "Numpad Section" § 3.4
    case numLock
    case numpad0
    case numpad1
    case numpad2
    case numpad3
    case numpad4
    case numpad5
    case numpad6
    case numpad7
    case numpad8
    case numpad9
    case numpadAdd
    case numpadBackspace
    case numpadClear
    case numpadClearEntry
    case numpadComma
    case numpadDecimal
    case numpadDivide
    case numpadEnter
    case numpadEqual
    case numpadMemoryAdd
    case numpadMemoryClear
    case numpadMemoryRecall
    case numpadMemoryStore
    case numpadMemorySubtract
    case numpadMultiply
    case numpadParenLeft
    case numpadParenRight
    case numpadSubtract
    case numpadSeparator
    case numpadUp
    case numpadDown
    case numpadRight
    case numpadLeft
    case numpadBegin
    case numpadHome
    case numpadEnd
    case numpadInsert
    case numpadDelete
    case numpadPageUp
    case numpadPageDown

    // "Function Section" § 3.5
    case escape
    case f1
    case f2
    case f3
    case f4
    case f5
    case f6
    case f7
    case f8
    case f9
    case f10
    case f11
    case f12
    case f13
    case f14
    case f15
    case f16
    case f17
    case f18
    case f19
    case f20
    case f21
    case f22
    case f23
    case f24
    case f25
    case fn
    case fnLock
    case printScreen
    case scrollLock
    case pause

    // "Media Keys" § 3.6
    case browserBack
    case browserFavorites
    case browserForward
    case browserHome
    case browserRefresh
    case browserSearch
    case browserStop
    case eject
    case launchApp1
    case launchApp2
    case launchMail
    case mediaPlayPause
    case mediaSelect
    case mediaStop
    case mediaTrackNext
    case mediaTrackPrevious
    case power
    case sleep
    case audioVolumeDown
    case audioVolumeMute
    case audioVolumeUp
    case wakeUp

    // "Legacy, Non-standard, and Special Keys" § 3.7
    case copy
    case cut
    case paste

    /// The libghostty key this case names.
    public var ghosttyKey: ghostty_input_key_e {
        switch self {
        case .backquote: GHOSTTY_KEY_BACKQUOTE
        case .backslash: GHOSTTY_KEY_BACKSLASH
        case .bracketLeft: GHOSTTY_KEY_BRACKET_LEFT
        case .bracketRight: GHOSTTY_KEY_BRACKET_RIGHT
        case .comma: GHOSTTY_KEY_COMMA
        case .digit0: GHOSTTY_KEY_DIGIT_0
        case .digit1: GHOSTTY_KEY_DIGIT_1
        case .digit2: GHOSTTY_KEY_DIGIT_2
        case .digit3: GHOSTTY_KEY_DIGIT_3
        case .digit4: GHOSTTY_KEY_DIGIT_4
        case .digit5: GHOSTTY_KEY_DIGIT_5
        case .digit6: GHOSTTY_KEY_DIGIT_6
        case .digit7: GHOSTTY_KEY_DIGIT_7
        case .digit8: GHOSTTY_KEY_DIGIT_8
        case .digit9: GHOSTTY_KEY_DIGIT_9
        case .equal: GHOSTTY_KEY_EQUAL
        case .intlBackslash: GHOSTTY_KEY_INTL_BACKSLASH
        case .intlRo: GHOSTTY_KEY_INTL_RO
        case .intlYen: GHOSTTY_KEY_INTL_YEN
        case .a: GHOSTTY_KEY_A
        case .b: GHOSTTY_KEY_B
        case .c: GHOSTTY_KEY_C
        case .d: GHOSTTY_KEY_D
        case .e: GHOSTTY_KEY_E
        case .f: GHOSTTY_KEY_F
        case .g: GHOSTTY_KEY_G
        case .h: GHOSTTY_KEY_H
        case .i: GHOSTTY_KEY_I
        case .j: GHOSTTY_KEY_J
        case .k: GHOSTTY_KEY_K
        case .l: GHOSTTY_KEY_L
        case .m: GHOSTTY_KEY_M
        case .n: GHOSTTY_KEY_N
        case .o: GHOSTTY_KEY_O
        case .p: GHOSTTY_KEY_P
        case .q: GHOSTTY_KEY_Q
        case .r: GHOSTTY_KEY_R
        case .s: GHOSTTY_KEY_S
        case .t: GHOSTTY_KEY_T
        case .u: GHOSTTY_KEY_U
        case .v: GHOSTTY_KEY_V
        case .w: GHOSTTY_KEY_W
        case .x: GHOSTTY_KEY_X
        case .y: GHOSTTY_KEY_Y
        case .z: GHOSTTY_KEY_Z
        case .minus: GHOSTTY_KEY_MINUS
        case .period: GHOSTTY_KEY_PERIOD
        case .quote: GHOSTTY_KEY_QUOTE
        case .semicolon: GHOSTTY_KEY_SEMICOLON
        case .slash: GHOSTTY_KEY_SLASH
        case .altLeft: GHOSTTY_KEY_ALT_LEFT
        case .altRight: GHOSTTY_KEY_ALT_RIGHT
        case .backspace: GHOSTTY_KEY_BACKSPACE
        case .capsLock: GHOSTTY_KEY_CAPS_LOCK
        case .contextMenu: GHOSTTY_KEY_CONTEXT_MENU
        case .controlLeft: GHOSTTY_KEY_CONTROL_LEFT
        case .controlRight: GHOSTTY_KEY_CONTROL_RIGHT
        case .enter: GHOSTTY_KEY_ENTER
        case .metaLeft: GHOSTTY_KEY_META_LEFT
        case .metaRight: GHOSTTY_KEY_META_RIGHT
        case .shiftLeft: GHOSTTY_KEY_SHIFT_LEFT
        case .shiftRight: GHOSTTY_KEY_SHIFT_RIGHT
        case .space: GHOSTTY_KEY_SPACE
        case .tab: GHOSTTY_KEY_TAB
        case .convert: GHOSTTY_KEY_CONVERT
        case .kanaMode: GHOSTTY_KEY_KANA_MODE
        case .nonConvert: GHOSTTY_KEY_NON_CONVERT
        case .delete: GHOSTTY_KEY_DELETE
        case .end: GHOSTTY_KEY_END
        case .help: GHOSTTY_KEY_HELP
        case .home: GHOSTTY_KEY_HOME
        case .insert: GHOSTTY_KEY_INSERT
        case .pageDown: GHOSTTY_KEY_PAGE_DOWN
        case .pageUp: GHOSTTY_KEY_PAGE_UP
        case .arrowDown: GHOSTTY_KEY_ARROW_DOWN
        case .arrowLeft: GHOSTTY_KEY_ARROW_LEFT
        case .arrowRight: GHOSTTY_KEY_ARROW_RIGHT
        case .arrowUp: GHOSTTY_KEY_ARROW_UP
        case .numLock: GHOSTTY_KEY_NUM_LOCK
        case .numpad0: GHOSTTY_KEY_NUMPAD_0
        case .numpad1: GHOSTTY_KEY_NUMPAD_1
        case .numpad2: GHOSTTY_KEY_NUMPAD_2
        case .numpad3: GHOSTTY_KEY_NUMPAD_3
        case .numpad4: GHOSTTY_KEY_NUMPAD_4
        case .numpad5: GHOSTTY_KEY_NUMPAD_5
        case .numpad6: GHOSTTY_KEY_NUMPAD_6
        case .numpad7: GHOSTTY_KEY_NUMPAD_7
        case .numpad8: GHOSTTY_KEY_NUMPAD_8
        case .numpad9: GHOSTTY_KEY_NUMPAD_9
        case .numpadAdd: GHOSTTY_KEY_NUMPAD_ADD
        case .numpadBackspace: GHOSTTY_KEY_NUMPAD_BACKSPACE
        case .numpadClear: GHOSTTY_KEY_NUMPAD_CLEAR
        case .numpadClearEntry: GHOSTTY_KEY_NUMPAD_CLEAR_ENTRY
        case .numpadComma: GHOSTTY_KEY_NUMPAD_COMMA
        case .numpadDecimal: GHOSTTY_KEY_NUMPAD_DECIMAL
        case .numpadDivide: GHOSTTY_KEY_NUMPAD_DIVIDE
        case .numpadEnter: GHOSTTY_KEY_NUMPAD_ENTER
        case .numpadEqual: GHOSTTY_KEY_NUMPAD_EQUAL
        case .numpadMemoryAdd: GHOSTTY_KEY_NUMPAD_MEMORY_ADD
        case .numpadMemoryClear: GHOSTTY_KEY_NUMPAD_MEMORY_CLEAR
        case .numpadMemoryRecall: GHOSTTY_KEY_NUMPAD_MEMORY_RECALL
        case .numpadMemoryStore: GHOSTTY_KEY_NUMPAD_MEMORY_STORE
        case .numpadMemorySubtract: GHOSTTY_KEY_NUMPAD_MEMORY_SUBTRACT
        case .numpadMultiply: GHOSTTY_KEY_NUMPAD_MULTIPLY
        case .numpadParenLeft: GHOSTTY_KEY_NUMPAD_PAREN_LEFT
        case .numpadParenRight: GHOSTTY_KEY_NUMPAD_PAREN_RIGHT
        case .numpadSubtract: GHOSTTY_KEY_NUMPAD_SUBTRACT
        case .numpadSeparator: GHOSTTY_KEY_NUMPAD_SEPARATOR
        case .numpadUp: GHOSTTY_KEY_NUMPAD_UP
        case .numpadDown: GHOSTTY_KEY_NUMPAD_DOWN
        case .numpadRight: GHOSTTY_KEY_NUMPAD_RIGHT
        case .numpadLeft: GHOSTTY_KEY_NUMPAD_LEFT
        case .numpadBegin: GHOSTTY_KEY_NUMPAD_BEGIN
        case .numpadHome: GHOSTTY_KEY_NUMPAD_HOME
        case .numpadEnd: GHOSTTY_KEY_NUMPAD_END
        case .numpadInsert: GHOSTTY_KEY_NUMPAD_INSERT
        case .numpadDelete: GHOSTTY_KEY_NUMPAD_DELETE
        case .numpadPageUp: GHOSTTY_KEY_NUMPAD_PAGE_UP
        case .numpadPageDown: GHOSTTY_KEY_NUMPAD_PAGE_DOWN
        case .escape: GHOSTTY_KEY_ESCAPE
        case .f1: GHOSTTY_KEY_F1
        case .f2: GHOSTTY_KEY_F2
        case .f3: GHOSTTY_KEY_F3
        case .f4: GHOSTTY_KEY_F4
        case .f5: GHOSTTY_KEY_F5
        case .f6: GHOSTTY_KEY_F6
        case .f7: GHOSTTY_KEY_F7
        case .f8: GHOSTTY_KEY_F8
        case .f9: GHOSTTY_KEY_F9
        case .f10: GHOSTTY_KEY_F10
        case .f11: GHOSTTY_KEY_F11
        case .f12: GHOSTTY_KEY_F12
        case .f13: GHOSTTY_KEY_F13
        case .f14: GHOSTTY_KEY_F14
        case .f15: GHOSTTY_KEY_F15
        case .f16: GHOSTTY_KEY_F16
        case .f17: GHOSTTY_KEY_F17
        case .f18: GHOSTTY_KEY_F18
        case .f19: GHOSTTY_KEY_F19
        case .f20: GHOSTTY_KEY_F20
        case .f21: GHOSTTY_KEY_F21
        case .f22: GHOSTTY_KEY_F22
        case .f23: GHOSTTY_KEY_F23
        case .f24: GHOSTTY_KEY_F24
        case .f25: GHOSTTY_KEY_F25
        case .fn: GHOSTTY_KEY_FN
        case .fnLock: GHOSTTY_KEY_FN_LOCK
        case .printScreen: GHOSTTY_KEY_PRINT_SCREEN
        case .scrollLock: GHOSTTY_KEY_SCROLL_LOCK
        case .pause: GHOSTTY_KEY_PAUSE
        case .browserBack: GHOSTTY_KEY_BROWSER_BACK
        case .browserFavorites: GHOSTTY_KEY_BROWSER_FAVORITES
        case .browserForward: GHOSTTY_KEY_BROWSER_FORWARD
        case .browserHome: GHOSTTY_KEY_BROWSER_HOME
        case .browserRefresh: GHOSTTY_KEY_BROWSER_REFRESH
        case .browserSearch: GHOSTTY_KEY_BROWSER_SEARCH
        case .browserStop: GHOSTTY_KEY_BROWSER_STOP
        case .eject: GHOSTTY_KEY_EJECT
        case .launchApp1: GHOSTTY_KEY_LAUNCH_APP_1
        case .launchApp2: GHOSTTY_KEY_LAUNCH_APP_2
        case .launchMail: GHOSTTY_KEY_LAUNCH_MAIL
        case .mediaPlayPause: GHOSTTY_KEY_MEDIA_PLAY_PAUSE
        case .mediaSelect: GHOSTTY_KEY_MEDIA_SELECT
        case .mediaStop: GHOSTTY_KEY_MEDIA_STOP
        case .mediaTrackNext: GHOSTTY_KEY_MEDIA_TRACK_NEXT
        case .mediaTrackPrevious: GHOSTTY_KEY_MEDIA_TRACK_PREVIOUS
        case .power: GHOSTTY_KEY_POWER
        case .sleep: GHOSTTY_KEY_SLEEP
        case .audioVolumeDown: GHOSTTY_KEY_AUDIO_VOLUME_DOWN
        case .audioVolumeMute: GHOSTTY_KEY_AUDIO_VOLUME_MUTE
        case .audioVolumeUp: GHOSTTY_KEY_AUDIO_VOLUME_UP
        case .wakeUp: GHOSTTY_KEY_WAKE_UP
        case .copy: GHOSTTY_KEY_COPY
        case .cut: GHOSTTY_KEY_CUT
        case .paste: GHOSTTY_KEY_PASTE
        }
    }

    /// The case naming `ghosttyKey`; nil for `GHOSTTY_KEY_UNIDENTIFIED` and
    /// any value this build of the header does not know.
    public init?(ghosttyKey: ghostty_input_key_e) {
        guard let key = Self.byGhosttyKey[ghosttyKey.rawValue] else { return nil }
        self = key
    }

    private static let byGhosttyKey: [UInt32: TerminalKey] = Dictionary(
        uniqueKeysWithValues: allCases.map { ($0.ghosttyKey.rawValue, $0) },
    )

    /// Whether libghostty can resolve this key on Apple platforms. Its key
    /// lookup takes a macOS virtual keycode, and some keys of the standard
    /// have none (numpad extras, media keys, IME mode keys).
    public var hasPlatformKeycode: Bool {
        TerminalHardwareKeyRouter.appKitKeyCode(for: ghosttyKey)
            != TerminalHardwareKeyRouter.unidentifiedAppKitKeyCode
    }

    // MARK: - US layout

    /// The characters this key types on a US (ANSI) layout: the unshifted
    /// one and, for keys with a shifted variant, the shifted one. Nil for
    /// keys that type nothing (Enter, arrows, modifiers) and for the
    /// layout-specific international keys.
    ///
    /// A programmatic press has no keyboard layout to ask, so this table
    /// stands in: it gives the press the `text` the key encoder needs to
    /// type a character on the legacy path and the unshifted codepoint the
    /// kitty protocol reports.
    public var usLayoutCharacters: (unshifted: Character, shifted: Character?)? {
        switch self {
        case .backquote: ("`", "~")
        case .backslash: ("\\", "|")
        case .bracketLeft: ("[", "{")
        case .bracketRight: ("]", "}")
        case .comma: (",", "<")
        case .digit0: ("0", ")")
        case .digit1: ("1", "!")
        case .digit2: ("2", "@")
        case .digit3: ("3", "#")
        case .digit4: ("4", "$")
        case .digit5: ("5", "%")
        case .digit6: ("6", "^")
        case .digit7: ("7", "&")
        case .digit8: ("8", "*")
        case .digit9: ("9", "(")
        case .equal: ("=", "+")
        case .a: ("a", "A")
        case .b: ("b", "B")
        case .c: ("c", "C")
        case .d: ("d", "D")
        case .e: ("e", "E")
        case .f: ("f", "F")
        case .g: ("g", "G")
        case .h: ("h", "H")
        case .i: ("i", "I")
        case .j: ("j", "J")
        case .k: ("k", "K")
        case .l: ("l", "L")
        case .m: ("m", "M")
        case .n: ("n", "N")
        case .o: ("o", "O")
        case .p: ("p", "P")
        case .q: ("q", "Q")
        case .r: ("r", "R")
        case .s: ("s", "S")
        case .t: ("t", "T")
        case .u: ("u", "U")
        case .v: ("v", "V")
        case .w: ("w", "W")
        case .x: ("x", "X")
        case .y: ("y", "Y")
        case .z: ("z", "Z")
        case .minus: ("-", "_")
        case .period: (".", ">")
        case .quote: ("'", "\"")
        case .semicolon: (";", ":")
        case .slash: ("/", "?")
        case .space: (" ", nil)
        case .numpad0: ("0", nil)
        case .numpad1: ("1", nil)
        case .numpad2: ("2", nil)
        case .numpad3: ("3", nil)
        case .numpad4: ("4", nil)
        case .numpad5: ("5", nil)
        case .numpad6: ("6", nil)
        case .numpad7: ("7", nil)
        case .numpad8: ("8", nil)
        case .numpad9: ("9", nil)
        case .numpadAdd: ("+", nil)
        case .numpadComma: (",", nil)
        case .numpadDecimal: (".", nil)
        case .numpadDivide: ("/", nil)
        case .numpadEqual: ("=", nil)
        case .numpadMultiply: ("*", nil)
        case .numpadParenLeft: ("(", nil)
        case .numpadParenRight: (")", nil)
        case .numpadSubtract: ("-", nil)
        default: nil
        }
    }

    /// The US-layout key that types `character`, and whether it needs
    /// Shift. Prefers the main block over the numpad, so "5" is ``digit5``.
    /// Nil for characters no US key types (control characters, letters
    /// outside ASCII).
    public static func usLayoutKey(
        typing character: Character,
    ) -> (key: TerminalKey, shifted: Bool)? {
        usLayoutKeysByCharacter[character]
    }

    private static let usLayoutKeysByCharacter: [Character: (key: TerminalKey, shifted: Bool)] = {
        var result: [Character: (key: TerminalKey, shifted: Bool)] = [:]
        // Declaration order: the writing-system block precedes the numpad,
        // so its keys win the shared digits and operators.
        for key in allCases {
            guard let characters = key.usLayoutCharacters else { continue }
            if result[characters.unshifted] == nil {
                result[characters.unshifted] = (key, false)
            }
            if let shifted = characters.shifted, result[shifted] == nil {
                result[shifted] = (key, true)
            }
        }
        return result
    }()
}
