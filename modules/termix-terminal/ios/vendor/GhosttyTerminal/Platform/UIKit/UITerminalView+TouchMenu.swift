//
//  UITerminalView+TouchMenu.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit

    extension UITerminalView {
        var isTouchMenuVisible: Bool {
            if #available(iOS 16.0, *) {
                return touchSelection.menuVisible
            }
            return UIMenuController.shared.isMenuVisible
        }

        func presentTouchMenu(at point: CGPoint) {
            guard surface != nil else { return }
            stopMomentumScrolling()
            touchSelection.menuPoint = point
            if #available(iOS 16.0, *) {
                selectionEditMenuInteraction.presentEditMenu(
                    with: UIEditMenuConfiguration(
                        identifier: "terminal.touchMenu" as NSString,
                        sourcePoint: point,
                    ),
                )
            } else {
                presentLegacyTouchMenu(at: point)
            }
        }

        func touchSelectionMenu(at point: CGPoint, suggestedActions: [UIMenuElement]) -> UIMenu {
            let systemMenuItems = systemAutoFillMenus(in: suggestedActions)
            let items: [UIMenuElement] = if let text = touchSelection.text {
                touchSelectionMenuItems(
                    for: TerminalTouchSelectionMenuContext(
                        sourcePoint: point, selectedText: text, systemMenuItems: systemMenuItems,
                    ),
                )
            } else {
                touchMenuItems(
                    for: TerminalTouchMenuContext(sourcePoint: point, systemMenuItems: systemMenuItems),
                )
            }
            // UIKit owns compact presentation, overflow arrows and expansion.
            return UIMenu(children: items)
        }

        private func systemAutoFillMenus(in elements: [UIMenuElement]) -> [UIMenuElement] {
            guard #available(iOS 17.0, *) else { return [] }
            return elements.flatMap { element -> [UIMenuElement] in
                guard let menu = element as? UIMenu else { return [] }
                if menu.identifier == .autoFill {
                    return [menu]
                }
                return systemAutoFillMenus(in: menu.children)
            }
        }

        func presentTouchSelectionMenu(at point: CGPoint) {
            guard touchSelection.range != nil else { return }
            if #available(iOS 16.0, *) {
                selectionEditMenuInteraction.presentEditMenu(
                    with: UIEditMenuConfiguration(
                        identifier: "terminal.touchSelection" as NSString,
                        sourcePoint: CGPoint(
                            x: min(bounds.maxX, max(0, point.x)),
                            y: min(bounds.maxY, max(0, point.y)),
                        ),
                    ),
                )
            } else {
                presentLegacyTouchMenu(at: point)
            }
        }

        /// Where the edit menu points: the whole selection with its handles
        /// while one is active, so UIKit places the menu above or below it
        /// instead of over the handle the user is about to drag.
        func touchMenuTargetRect(at point: CGPoint) -> CGRect {
            if touchSelection.range != nil, let rect = touchSelection.overlay?.menuAvoidanceRect, !rect.isEmpty {
                return rect
            }
            return CGRect(origin: point, size: CGSize(width: 1, height: 1))
        }

        private func presentLegacyTouchMenu(at point: CGPoint) {
            // UIMenuController requires a first responder. A plain view routes
            // actions through its superview without opening the terminal keyboard.
            if !isFirstResponder {
                if touchSelection.menuResponder == nil {
                    let responder = TerminalTouchMenuResponder(frame: .zero)
                    addSubview(responder)
                    touchSelection.menuResponder = responder
                }
                touchSelection.menuResponder?.becomeFirstResponder()
            }
            let menu = UIMenuController.shared
            menu.menuItems = nil
            menu.showMenu(from: self, rect: touchMenuTargetRect(at: point))
            menu.update()
        }
    }

    private final class TerminalTouchMenuResponder: UIView {
        override var canBecomeFirstResponder: Bool {
            true
        }
    }

    @available(iOS 16.0, *)
    extension UITerminalView: @preconcurrency UIEditMenuInteractionDelegate {
        public func editMenuInteraction(
            _: UIEditMenuInteraction,
            willPresentMenuFor _: UIEditMenuConfiguration,
            animator _: any UIEditMenuInteractionAnimating,
        ) {
            touchSelection.menuVisible = true
        }

        public func editMenuInteraction(
            _: UIEditMenuInteraction,
            willDismissMenuFor _: UIEditMenuConfiguration,
            animator: any UIEditMenuInteractionAnimating,
        ) {
            touchSelection.menuVisible = false
            guard let action = touchSelection.pendingAction else { return }
            touchSelection.pendingAction = nil
            animator.addCompletion(action)
        }

        public func editMenuInteraction(
            _: UIEditMenuInteraction,
            targetRectFor configuration: UIEditMenuConfiguration,
        ) -> CGRect {
            touchMenuTargetRect(at: configuration.sourcePoint)
        }

        public func editMenuInteraction(
            _: UIEditMenuInteraction,
            menuFor configuration: UIEditMenuConfiguration,
            suggestedActions: [UIMenuElement],
        ) -> UIMenu? {
            if configuration.identifier as? String == "terminal.touchMenu"
                || configuration.identifier as? String == "terminal.touchSelection"
            {
                return touchSelectionMenu(at: configuration.sourcePoint, suggestedActions: suggestedActions)
            }
            return UIMenu(children: suggestedActions)
        }
    }
#endif
