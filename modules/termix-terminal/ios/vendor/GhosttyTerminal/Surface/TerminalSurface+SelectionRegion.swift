//
//  TerminalSurface+SelectionRegion.swift
//  libghostty-spm
//

import CoreGraphics
import Foundation
import GhosttyKit

public extension TerminalSurface {
    /// Where the selection lies on screen, nil when there is no selection
    /// or none of it is in view. Read under Ghostty's renderer lock, so the
    /// corners and the grid they count in always belong together
    /// (`ghostty_surface_selection_viewport`, Patches/ghostty/0020).
    func selectionRegion() -> TerminalSelectionRegion? {
        guard let surface = rawValue else { return nil }
        var out = ghostty_selection_viewport_s()
        guard ghostty_surface_selection_viewport(surface, &out) else { return nil }
        let region = TerminalSelectionRegion(out)
        TerminalDebugLog.log(
            .input,
            "surface selectionRegion \(region.topLeft.column),\(region.topLeft.row)…\(region.bottomRight.column),\(region.bottomRight.row) grid=\(region.columns)x\(region.rows) rectangle=\(region.isRectangle) clipped=\(region.isClippedAtTop)/\(region.isClippedAtBottom)",
        )
        return region
    }

    /// The viewport cell under `point`, in view points from the surface's
    /// top-left corner, the coordinates of ``sendMousePos(x:y:modifiers:)``.
    /// `scale` is the view's backing scale. A point in the padding maps to
    /// the nearest edge cell, as Ghostty maps a click there. Nil with no
    /// surface or before the first frame has a grid.
    func viewportCell(at point: CGPoint, scale: CGFloat) -> TerminalViewportCell? {
        guard let metrics = size(),
              let first = readCells(0 ... 0, columns: Int(metrics.columns), viewport: true),
              let grid = TerminalSelectionGrid(
                  metrics: metrics, scale: scale,
                  firstBaseline: first.firstBaseline, imeBottom: imePoint().y,
              )
        else { return nil }
        let cell = grid.cell(at: point, viewportOffset: 0)
        return TerminalViewportCell(column: cell % grid.columns, row: cell / grid.columns)
    }

    /// Whether the cell under `point` is selected — the test for a press
    /// that should drag the selection out rather than start a new one.
    func selectionContains(_ point: CGPoint, scale: CGFloat) -> Bool {
        guard let region = selectionRegion(),
              let cell = viewportCell(at: point, scale: scale)
        else { return false }
        return region.contains(cell)
    }
}

extension TerminalSelectionRegion {
    init(_ raw: ghostty_selection_viewport_s) {
        self.init(
            topLeft: TerminalViewportCell(column: Int(raw.top_left_x), row: Int(raw.top_left_y)),
            bottomRight: TerminalViewportCell(column: Int(raw.bottom_right_x), row: Int(raw.bottom_right_y)),
            columns: Int(raw.columns),
            rows: Int(raw.rows),
            isRectangle: raw.rectangle,
            isClippedAtTop: raw.top_left_clipped,
            isClippedAtBottom: raw.bottom_right_clipped,
        )
    }
}
