//
//  UITerminalView+TouchMenuActions.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit

    extension UITerminalView {
        func defaultTouchMenuItems(at point: CGPoint, selecting: Bool) -> [UIMenuElement] {
            let paste = UIAction(
                title: String(localized: "Paste", bundle: .module),
                image: UIImage(systemName: "doc.on.clipboard"),
                identifier: UIAction.Identifier("terminal.paste"),
            ) { [weak self] _ in
                self?.dismissTouchSelection()
                self?.pasteFromPasteboard()
            }
            let select = UIAction(
                title: String(localized: "Select", bundle: .module),
                image: UIImage(systemName: "selection.pin.in.out"),
                identifier: UIAction.Identifier("terminal.select"),
            ) { [weak self] _ in
                self?.touchSelection.pendingAction = { [weak self] in
                    self?.beginTouchSelection(at: point, selectAll: false)
                }
            }
            let selectAll = UIAction(
                title: String(localized: "Select All", bundle: .module),
                image: UIImage(systemName: "character.textbox"),
                identifier: UIAction.Identifier("terminal.selectAll"),
            ) { [weak self] _ in
                self?.touchSelection.pendingAction = { [weak self] in
                    self?.beginTouchSelection(at: point, selectAll: true)
                }
            }
            let copy = UIAction(
                title: String(localized: "Copy", bundle: .module),
                image: UIImage(systemName: "doc.on.doc"),
                identifier: UIAction.Identifier("terminal.copy"),
            ) { [weak self] _ in
                _ = self?.copyTouchSelection()
            }
            let pasteItems: [UIMenuElement] = TerminalPasteboardContent.hasContent() ? [paste] : []
            return selecting ? [copy] + pasteItems + [selectAll] : pasteItems + [select, selectAll]
        }
    }
#endif
