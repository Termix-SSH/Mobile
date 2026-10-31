//
//  TerminalInputModifiers.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/16.
//

import GhosttyKit

#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

public struct TerminalInputModifiers: OptionSet, Hashable, Sendable {
    public let rawValue: UInt32

    public init(rawValue: UInt32) {
        self.rawValue = rawValue
    }

    public static let shift = TerminalInputModifiers(rawValue: 1 << 0)
    public static let ctrl = TerminalInputModifiers(rawValue: 1 << 1)
    public static let alt = TerminalInputModifiers(rawValue: 1 << 2)
    public static let super_ = TerminalInputModifiers(rawValue: 1 << 3)
    public static let caps = TerminalInputModifiers(rawValue: 1 << 4)
    public static let num = TerminalInputModifiers(rawValue: 1 << 5)
    public static let shiftRight = TerminalInputModifiers(rawValue: 1 << 6)
    public static let ctrlRight = TerminalInputModifiers(rawValue: 1 << 7)
    public static let altRight = TerminalInputModifiers(rawValue: 1 << 8)
    public static let superRight = TerminalInputModifiers(rawValue: 1 << 9)

    public var ghosttyMods: ghostty_input_mods_e {
        ghostty_input_mods_e(rawValue)
    }

    #if canImport(UIKit)
        public init(from flags: UIKeyModifierFlags) {
            var mods = TerminalInputModifiers()
            if flags.contains(.shift) {
                mods.insert(.shift)
            }
            if flags.contains(.control) {
                mods.insert(.ctrl)
            }
            if flags.contains(.alternate) {
                mods.insert(.alt)
            }
            if flags.contains(.command) {
                mods.insert(.super_)
            }
            if flags.contains(.alphaShift) {
                mods.insert(.caps)
            }
            if flags.contains(.numericPad) {
                mods.insert(.num)
            }
            self = mods
        }

    #elseif canImport(AppKit)
        public init(from flags: NSEvent.ModifierFlags) {
            var mods = TerminalInputModifiers()
            if flags.contains(.shift) {
                mods.insert(.shift)
            }
            if flags.contains(.control) {
                mods.insert(.ctrl)
            }
            if flags.contains(.option) {
                mods.insert(.alt)
            }
            if flags.contains(.command) {
                mods.insert(.super_)
            }
            if flags.contains(.capsLock) {
                mods.insert(.caps)
            }
            if flags.contains(.numericPad) {
                mods.insert(.num)
            }
            // Which side is held, as upstream's `ghosttyMods` reads it:
            // `macos-option-as-alt = left` makes only the left Option an Alt
            // and leaves the right one composing (ą on Polish Pro). Without
            // the bit every Option read as the left one.
            let raw = flags.rawValue
            if raw & UInt(NX_DEVICERSHIFTKEYMASK) != 0 {
                mods.insert(.shiftRight)
            }
            if raw & UInt(NX_DEVICERCTLKEYMASK) != 0 {
                mods.insert(.ctrlRight)
            }
            if raw & UInt(NX_DEVICERALTKEYMASK) != 0 {
                mods.insert(.altRight)
            }
            if raw & UInt(NX_DEVICERCMDKEYMASK) != 0 {
                mods.insert(.superRight)
            }
            self = mods
        }
    #endif
}
