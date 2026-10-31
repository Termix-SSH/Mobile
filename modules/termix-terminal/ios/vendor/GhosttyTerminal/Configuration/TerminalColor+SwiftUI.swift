//
//  TerminalColor+SwiftUI.swift
//  libghostty-spm
//

#if canImport(SwiftUI)
    import SwiftUI

    public extension Color {
        /// sRGB: the space ghostty renders in unless `window-colorspace`
        /// says otherwise.
        init(_ color: TerminalColor) {
            self.init(
                .sRGB,
                red: Double(color.red) / 255,
                green: Double(color.green) / 255,
                blue: Double(color.blue) / 255,
                opacity: 1,
            )
        }
    }
#endif
