//
//  TerminalColor.swift
//  libghostty-spm
//

import GhosttyKit

/// An RGB color as ghostty resolved it.
public struct TerminalColor: Hashable, Sendable {
    public let red: UInt8
    public let green: UInt8
    public let blue: UInt8

    public init(red: UInt8, green: UInt8, blue: UInt8) {
        self.red = red
        self.green = green
        self.blue = blue
    }

    init(_ raw: ghostty_config_color_s) {
        self.init(red: raw.r, green: raw.g, blue: raw.b)
    }
}
