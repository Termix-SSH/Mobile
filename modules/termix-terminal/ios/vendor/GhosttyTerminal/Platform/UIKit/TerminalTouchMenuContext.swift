//
//  TerminalTouchMenuContext.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit

    /// Context for the terminal menu when no text is selected.
    public struct TerminalTouchMenuContext {
        /// Location in the terminal view's coordinate space.
        public let sourcePoint: CGPoint
        /// System-provided menu elements, included in the default menu items.
        public let systemMenuItems: [UIMenuElement]

        public init(sourcePoint: CGPoint, systemMenuItems: [UIMenuElement] = []) {
            self.sourcePoint = sourcePoint
            self.systemMenuItems = systemMenuItems
        }
    }
#endif
