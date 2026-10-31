//
//  TerminalSelectionGrid.swift
//  libghostty-spm
//

import CoreGraphics
import Foundation

/// Selection positions are terminal cells, never UTF-16 or Unicode scalar offsets.
/// Rows are absolute screen rows (including scrollback); geometry is in view points.
struct TerminalSelectionGrid: Equatable {
    let columns: Int
    let rows: Int
    let cellSize: CGSize
    let origin: CGPoint

    init?(metrics: TerminalGridMetrics, scale: CGFloat, firstBaseline: CGPoint, imeBottom: CGFloat) {
        guard metrics.columns > 0, metrics.rows > 0,
              metrics.cellWidthPixels > 0, metrics.cellHeightPixels > 0, scale > 0
        else { return nil }
        columns = Int(metrics.columns)
        rows = Int(metrics.rows)
        cellSize = CGSize(
            width: CGFloat(metrics.cellWidthPixels) / scale,
            height: CGFloat(metrics.cellHeightPixels) / scale,
        )
        // Both values include top padding. Their difference is an integer
        // number of rows plus the font's baseline offset from the cell bottom.
        // This also works when padding is larger than one cell.
        let delta = imeBottom - firstBaseline.y
        let baseline = delta - floor((delta + 0.0001) / cellSize.height) * cellSize.height
        origin = CGPoint(x: firstBaseline.x, y: firstBaseline.y - cellSize.height + baseline)
    }

    func cell(at point: CGPoint, viewportOffset: Int) -> Int {
        let column = min(columns - 1, max(0, Int(floor((point.x - origin.x) / cellSize.width))))
        let row = min(rows - 1, max(0, Int(floor((point.y - origin.y) / cellSize.height))))
        return (row + viewportOffset) * columns + column
    }

    func rect(for cell: Int, viewportOffset: Int) -> CGRect {
        CGRect(
            x: origin.x + CGFloat(cell % columns) * cellSize.width,
            y: origin.y + CGFloat(cell / columns - viewportOffset) * cellSize.height,
            width: cellSize.width, height: cellSize.height,
        )
    }

    /// One rect per visible row of `range`. With `textCells` (a row's
    /// occupied cells, nil for a blank row) each rect covers only the text
    /// in it, so the padding a TUI paints around its lines, which a copy
    /// leaves out (`TerminalCopyText`), is not shown as selected either.
    func rects(
        for range: ClosedRange<Int>,
        viewportOffset: Int,
        textCells: ((Int) -> ClosedRange<Int>?)? = nil,
    ) -> [CGRect] {
        let first = max(range.lowerBound, viewportOffset * columns)
        let last = min(range.upperBound, (viewportOffset + rows) * columns - 1)
        guard first <= last else { return [] }
        return (first / columns ... last / columns).compactMap { row in
            var start = max(first, row * columns)
            var end = min(last, (row + 1) * columns - 1)
            if let textCells {
                guard let text = textCells(row) else { return nil }
                start = max(start, text.lowerBound)
                end = min(end, text.upperBound)
                guard start <= end else { return nil }
            }
            return rect(for: start, viewportOffset: viewportOffset)
                .union(rect(for: end, viewportOffset: viewportOffset))
        }
    }
}
