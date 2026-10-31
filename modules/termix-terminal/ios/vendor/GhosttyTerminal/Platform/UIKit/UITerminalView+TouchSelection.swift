//
//  UITerminalView+TouchSelection.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit

    struct TouchSelectionState {
        #if targetEnvironment(macCatalyst)
            var enabled = false
        #else
            var enabled = true
        #endif
        var lastInputWasDirect = true
        var range: ClosedRange<Int>?
        var grid: TerminalSelectionGrid?
        weak var surface: TerminalSurface?
        var text: String?
        var menuPoint: CGPoint?
        var menuVisible = false
        var menuResponder: UIView?
        var tapRecognizers: [UITapGestureRecognizer] = []
        var tapBeganWithMenu = false
        var tapStopsMomentum = false
        var longPress: UILongPressGestureRecognizer?
        var scrollGesture: UIPanGestureRecognizer?
        var panUsesSelection = false
        var pivot: ClosedRange<Int>?
        var selectsRows = false
        var pendingAction: (() -> Void)?
        var overlay: TerminalTouchSelectionOverlay?
        var dragPoint: CGPoint?
        var dragOrigin: CGPoint?
        var endpoint: TerminalTouchSelectionOverlay.Endpoint?
        var scrollTask: Task<Void, Never>?
        var loupe: TerminalTouchSelectionLoupe?
        var loupeEnabled = true
        var lastValidation: TimeInterval = 0
        /// Each row's occupied cells, read once for the highlight; dropped
        /// whenever the selection is re-checked against the screen.
        var rowTextCells: [Int: ClosedRange<Int>?] = [:]
        /// Where the viewport was when the selection began, so a drag that
        /// scrolled it into history can put it back when the selection
        /// goes; `atBottom` follows output that arrived meanwhile.
        var viewportBeforeSelection: (offset: Int, atBottom: Bool)?
        /// The row a drag past the top or bottom edge last scrolled the
        /// viewport to. Nil until a drag scrolls; a viewport found anywhere
        /// else when the selection goes was moved by the user since, and
        /// stays where they left it.
        var autoscrolledOffset: Int?
    }

    extension UITerminalView {
        var touchViewportOffset: Int {
            Int(core.bridge.scrollbar?.offset ?? 0)
        }

        func touchSelectionGrid() -> TerminalSelectionGrid? {
            guard let surface, let metrics = surface.size(),
                  let first = surface.readCells(0 ... 0, columns: Int(metrics.columns), viewport: true)
            else { return nil }
            return TerminalSelectionGrid(
                metrics: metrics, scale: resolvedDisplayScale(),
                firstBaseline: first.firstBaseline, imeBottom: surface.imePoint().y,
            )
        }

        func beginTouchSelection(at point: CGPoint, selectAll: Bool, selectLine: Bool = false) {
            guard usesInlineTextSelection, window != nil, let surface, let grid = touchSelectionGrid() else { return }
            stopMomentumScrolling()
            let cell = grid.cell(at: point, viewportOffset: touchViewportOffset)
            let total = max(grid.rows, Int(core.bridge.scrollbar?.total ?? UInt64(grid.rows)))
            let range: ClosedRange<Int>
            if selectAll {
                guard let last = surface.lastTextCell(rows: total, columns: grid.columns) else { return }
                range = 0 ... last
            } else if selectLine {
                let start = cell / grid.columns * grid.columns
                range = start ... (start + grid.columns - 1)
            } else {
                let word = surface.wordCells(at: cell, columns: grid.columns)
                if let text = surface.readCells(word, columns: grid.columns)?.text,
                   !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                {
                    range = word
                } else {
                    let visibleRows = touchViewportOffset ..< min(total, touchViewportOffset + grid.rows)
                    guard let row = surface.nearestTextRow(
                        to: cell / grid.columns, in: visibleRows, columns: grid.columns,
                    ), let textCells = surface.textCells(inRow: row, columns: grid.columns) else { return }
                    // Seed a character selection from the nearest row's text;
                    // both handles must remain free to move within that row.
                    range = textCells
                }
            }
            guard let text = surface.readCells(range, columns: grid.columns)?.text, !text.isEmpty else { return }
            // A new selection over the old one's scrolled viewport still
            // belongs to the place the first one started from.
            let viewportBefore = touchSelection.autoscrolledOffset == nil
                ? currentTouchViewport(rows: grid.rows)
                : touchSelection.viewportBeforeSelection ?? currentTouchViewport(rows: grid.rows)
            let autoscrolled = touchSelection.autoscrolledOffset
            dismissTouchSelection(restoringViewport: false)
            touchSelection.viewportBeforeSelection = viewportBefore
            touchSelection.autoscrolledOffset = autoscrolled
            // Touch selection owns its highlight; never synthesize mouse events
            // (even Shift can be captured by a TUI).
            _ = surface.performBindingAction("clear_selection")
            touchSelection.range = range
            touchSelection.grid = grid
            touchSelection.surface = surface
            touchSelection.text = text
            touchSelection.pivot = surface.glyphCells(at: range.lowerBound, columns: grid.columns)
            touchSelection.selectsRows = selectLine
            touchSelection.menuPoint = point
            let overlay = TerminalTouchSelectionOverlay(frame: bounds)
            overlay.onDrag = { [weak self] endpoint, gesture in self?.dragTouchSelection(endpoint, gesture: gesture) }
            touchSelection.overlay = overlay
            addSubview(overlay)
            overlay.update(grid: grid, range: range, offset: touchViewportOffset, textCells: touchSelectionTextCells)
            presentTouchSelectionMenu(at: point)
        }

        /// Takes the selection down. With `restoringViewport`, a viewport a
        /// drag scrolled into history goes back to where the selection
        /// began — the bottom, when it began there — unless the user has
        /// scrolled it since; a scroll gesture passes false, being the user
        /// moving it.
        func dismissTouchSelection(restoringViewport: Bool = true) {
            let viewportBefore = touchSelection.viewportBeforeSelection
            let autoscrolled = touchSelection.autoscrolledOffset
            touchSelection.viewportBeforeSelection = nil
            touchSelection.autoscrolledOffset = nil
            if restoringViewport, let viewportBefore, let autoscrolled, autoscrolled == touchViewportOffset {
                restoreTouchViewport(viewportBefore)
            }
            guard touchSelection.range != nil || touchSelection.overlay != nil || isTouchMenuVisible else {
                return
            }
            stopMomentumScrolling()
            endTouchSelectionLoupe()
            touchSelection.scrollTask?.cancel()
            touchSelection.scrollTask = nil
            touchSelection.overlay?.removeFromSuperview()
            touchSelection.overlay = nil
            touchSelection.range = nil
            touchSelection.grid = nil
            touchSelection.text = nil
            touchSelection.rowTextCells = [:]
            touchSelection.surface = nil
            touchSelection.dragPoint = nil
            touchSelection.dragOrigin = nil
            touchSelection.endpoint = nil
            touchSelection.pivot = nil
            touchSelection.panUsesSelection = false
            if #available(iOS 16.0, *), touchSelection.enabled {
                selectionEditMenuInteraction.dismissMenu()
            } else if touchSelection.enabled {
                UIMenuController.shared.hideMenu()
            }
        }

        private func currentTouchViewport(rows: Int) -> (offset: Int, atBottom: Bool) {
            let offset = touchViewportOffset
            let total = Int(core.bridge.scrollbar?.total ?? UInt64(rows))
            return (offset, offset + rows >= total)
        }

        private func restoreTouchViewport(_ viewport: (offset: Int, atBottom: Bool)) {
            guard let surface else { return }
            if viewport.atBottom {
                _ = surface.performBindingAction("scroll_to_bottom")
            } else {
                _ = surface.scrollToRow(UInt(viewport.offset))
            }
            core.requestImmediateTick()
        }

        func refreshTouchSelection() {
            guard let range = touchSelection.range, var grid = touchSelection.grid else { return }
            guard surface === touchSelection.surface, let metrics = surface?.size(),
                  Int(metrics.columns) == grid.columns,
                  CGFloat(metrics.cellWidthPixels) / resolvedDisplayScale() == grid.cellSize.width,
                  CGFloat(metrics.cellHeightPixels) / resolvedDisplayScale() == grid.cellSize.height
            else {
                dismissTouchSelection()
                return
            }
            // Connecting a hardware keyboard changes the visible row count.
            // Absolute cells remain valid without a column reflow; keep the
            // selection so the first Cmd+C can still copy it.
            if Int(metrics.rows) != grid.rows {
                guard let resized = touchSelectionGrid(),
                      surface?.readCells(range, columns: grid.columns)?.text == touchSelection.text
                else {
                    dismissTouchSelection()
                    return
                }
                grid = resized
                touchSelection.grid = resized
            }
            let now = Date.timeIntervalSinceReferenceDate
            if now - touchSelection.lastValidation > 0.25, touchSelection.dragPoint == nil {
                touchSelection.lastValidation = now
                touchSelection.rowTextCells = [:]
                guard surface?.readCells(range, columns: grid.columns)?.text == touchSelection.text else {
                    dismissTouchSelection()
                    return
                }
            }
            touchSelection.overlay?.frame = bounds
            touchSelection.overlay?.update(
                grid: grid, range: range, offset: touchViewportOffset, textCells: touchSelectionTextCells,
            )
        }

        func touchSelectionTextCells(inRow row: Int) -> ClosedRange<Int>? {
            if let cached = touchSelection.rowTextCells[row] {
                return cached
            }
            guard let grid = touchSelection.grid else { return nil }
            let cells = surface?.textCells(inRow: row, columns: grid.columns)
            touchSelection.rowTextCells[row] = .some(cells)
            return cells
        }

        /// The column Ghostty's own selection starts at, for
        /// `TerminalCopyText`; 0 when that is not on screen.
        func selectionStartColumn(_ selection: TerminalSurface.SelectionResult) -> Int {
            guard selection.topLeftX >= 0, let grid = touchSelectionGrid() else { return 0 }
            let column = ((CGFloat(selection.topLeftX) - grid.origin.x) / grid.cellSize.width).rounded()
            return min(grid.columns - 1, max(0, Int(column)))
        }

        func copyTouchSelection() -> Bool {
            guard let range = touchSelection.range, let grid = touchSelection.grid,
                  let text = surface?.readCells(range, columns: grid.columns)?.text,
                  text == touchSelection.text, !text.isEmpty
            else { return false }
            let copied = TerminalCopyText.clean(text, startColumn: range.lowerBound % grid.columns)
            UIPasteboard.general.string = copied
            #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
                    accessibilityValue = copied
                }
            #endif
            dismissTouchSelection()
            return true
        }
    }
#endif
