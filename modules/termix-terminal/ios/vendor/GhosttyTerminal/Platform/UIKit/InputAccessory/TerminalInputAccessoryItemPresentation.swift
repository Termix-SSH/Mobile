//
//  TerminalInputAccessoryItemPresentation.swift
//  libghostty-spm
//

#if canImport(UIKit)
    #if !targetEnvironment(macCatalyst)
        import UIKit

        /// How the accessory bar draws a text key, apart from what it sends.
        public enum TerminalInputAccessoryItemPresentation: Equatable, Sendable {
            /// A label on one line, in a capsule that widens to fit it.
            case text(String)
            /// A picture filling a round button, cropped to the circle; an SF
            /// Symbol image is a glyph instead, centered like the built-in
            /// keys' and tinted with the bar's foreground.
            /// `accessibilityLabel` names the key; without one the key's text
            /// does.
            case image(UIImage, accessibilityLabel: String? = nil)
        }
    #endif
#endif
