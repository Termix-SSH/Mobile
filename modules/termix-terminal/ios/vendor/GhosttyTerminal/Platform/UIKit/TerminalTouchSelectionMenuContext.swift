//
//  TerminalTouchSelectionMenuContext.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit

    /// Context for the terminal menu while text is selected.
    public struct TerminalTouchSelectionMenuContext {
        /// Location in the terminal view's coordinate space.
        public let sourcePoint: CGPoint
        /// A snapshot of the selected terminal text when the menu is built.
        public let selectedText: String
        /// System-provided menu elements, included in the default menu items.
        public let systemMenuItems: [UIMenuElement]

        public init(sourcePoint: CGPoint, selectedText: String, systemMenuItems: [UIMenuElement] = []) {
            self.sourcePoint = sourcePoint
            self.selectedText = selectedText
            self.systemMenuItems = systemMenuItems
        }
    }
#endif
