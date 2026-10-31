//
//  UITerminalView+TouchSelectionDrag.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit

    extension UITerminalView {
        func dragTouchSelection(_ endpoint: TerminalTouchSelectionOverlay.Endpoint, gesture: UIPanGestureRecognizer) {
            guard let grid = touchSelection.grid, let range = touchSelection.range else { return }
            switch gesture.state {
            case .began:
                if #available(iOS 16.0, *) {
                    selectionEditMenuInteraction.dismissMenu()
                }
                let cell = endpoint == .start ? range.lowerBound : range.upperBound
                let fixed = endpoint == .start ? range.upperBound : range.lowerBound
                touchSelection.pivot = surface?.glyphCells(at: fixed, columns: grid.columns)
                let rect = grid.rect(for: cell, viewportOffset: touchViewportOffset)
                touchSelection.dragOrigin = CGPoint(x: rect.midX, y: rect.midY)
                touchSelection.endpoint = endpoint
                beginTouchSelectionLoupe(at: gesture.location(in: self), from: gesture.view)
                #if !targetEnvironment(macCatalyst)
                    softwareKeyboard.tapCandidateArmed = false
                #endif
            case .changed, .ended:
                guard let origin = touchSelection.dragOrigin else { return }
                let delta = gesture.translation(in: self)
                let point = CGPoint(x: origin.x + delta.x, y: origin.y + delta.y)
                touchSelection.dragPoint = point
                extendTouchSelection(to: point, endpoint: endpoint)
                if gesture.state == .ended {
                    finishTouchSelectionDrag(at: point)
                } else {
                    moveTouchSelectionLoupe(to: point)
                    startTouchSelectionScrolling()
                }
            case .cancelled, .failed:
                finishTouchSelectionDrag(at: gesture.location(in: self))
            default:
                break
            }
        }

        func extendTouchSelection(to point: CGPoint, endpoint: TerminalTouchSelectionOverlay.Endpoint) {
            guard let surface, let grid = touchSelection.grid, let range = touchSelection.range else { return }
            let cell = grid.cell(at: point, viewportOffset: touchViewportOffset)
            let glyph = surface.glyphCells(at: cell, columns: grid.columns)
            let fixed = touchSelection.pivot
                ?? (endpoint == .start ? range.upperBound ... range.upperBound : range.lowerBound ... range.lowerBound)
            var updated = min(glyph.lowerBound, fixed.lowerBound) ... max(glyph.upperBound, fixed.upperBound)
            if touchSelection.selectsRows {
                let firstCell = updated.lowerBound / grid.columns * grid.columns
                let lastCell = updated.upperBound / grid.columns * grid.columns + grid.columns - 1
                updated = firstCell ... lastCell
            }
            guard updated != range else { return }
            guard let text = surface.readCells(updated, columns: grid.columns)?.text else { return }
            touchSelection.range = updated
            touchSelection.text = text
            touchSelection.overlay?.update(
                grid: grid, range: updated, offset: touchViewportOffset, textCells: touchSelectionTextCells,
            )
        }

        func startTouchSelectionScrolling() {
            guard touchSelection.scrollTask == nil else { return }
            touchSelection.scrollTask = Task { @MainActor [weak self] in
                while !Task.isCancelled {
                    do {
                        try await Task.sleep(nanoseconds: 80_000_000)
                    } catch {
                        return
                    }
                    guard let self, let point = touchSelection.dragPoint, let endpoint = touchSelection.endpoint,
                          let grid = touchSelection.grid, let bar = core.bridge.scrollbar
                    else { return }
                    let top = grid.origin.y + grid.cellSize.height
                    let bottom = grid.origin.y + CGFloat(grid.rows - 1) * grid.cellSize.height
                    let direction = point.y < top ? -1 : (point.y > bottom ? 1 : 0)
                    let row = min(max(0, Int(bar.total) - grid.rows), max(0, touchViewportOffset + direction))
                    if direction != 0, row != touchViewportOffset {
                        _ = surface?.scrollToRow(UInt(row))
                        touchSelection.autoscrolledOffset = row
                        core.requestImmediateTick()
                        // The next tick publishes the new viewport offset.
                    }
                    extendTouchSelection(to: point, endpoint: endpoint)
                    moveTouchSelectionLoupe(to: point)
                }
            }
        }

        func finishTouchSelectionDrag(at point: CGPoint) {
            endTouchSelectionLoupe()
            touchSelection.scrollTask?.cancel()
            touchSelection.scrollTask = nil
            touchSelection.dragPoint = nil
            touchSelection.dragOrigin = nil
            touchSelection.endpoint = nil
            presentTouchSelectionMenu(at: point)
        }
    }
#endif
