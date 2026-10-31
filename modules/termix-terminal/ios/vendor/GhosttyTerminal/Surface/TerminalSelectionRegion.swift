//
//  TerminalSelectionRegion.swift
//  libghostty-spm
//

import Foundation

/// A cell of the visible grid: column 0 is the leftmost, row 0 the top row
/// on screen, whatever the scrollback holds above it.
public struct TerminalViewportCell: Hashable, Sendable {
    public var column: Int
    public var row: Int

    public init(column: Int, row: Int) {
        self.column = column
        self.row = row
    }
}

/// Where the user's selection lies on screen, as Ghostty's terminal holds it.
///
/// The corners are viewport cells counted in the terminal's own grid,
/// ``columns`` by ``rows``. That grid can differ from the view's size while
/// a resize is still on its way to the terminal, which is why the region
/// carries it and why the corners are cells rather than a linear offset.
/// A corner that scrolled out of view is clipped to the viewport's top or
/// bottom row: a rectangle keeps its column there, a linear selection runs
/// to the first or last cell, the same cells Ghostty highlights.
public struct TerminalSelectionRegion: Hashable, Sendable {
    public let topLeft: TerminalViewportCell
    public let bottomRight: TerminalViewportCell
    public let columns: Int
    public let rows: Int
    /// A block selection (Option-drag on macOS): every row covers the same
    /// columns. Otherwise the selection runs from ``topLeft`` to
    /// ``bottomRight`` in reading order, whole rows in between.
    public let isRectangle: Bool
    /// The selection continues above the viewport.
    public let isClippedAtTop: Bool
    /// The selection continues below the viewport.
    public let isClippedAtBottom: Bool

    public init(
        topLeft: TerminalViewportCell,
        bottomRight: TerminalViewportCell,
        columns: Int,
        rows: Int,
        isRectangle: Bool,
        isClippedAtTop: Bool = false,
        isClippedAtBottom: Bool = false,
    ) {
        self.topLeft = topLeft
        self.bottomRight = bottomRight
        self.columns = columns
        self.rows = rows
        self.isRectangle = isRectangle
        self.isClippedAtTop = isClippedAtTop
        self.isClippedAtBottom = isClippedAtBottom
    }

    /// Whether Ghostty counts `cell` as selected; the rule of
    /// `Selection.contains` in Ghostty's terminal.
    public func contains(_ cell: TerminalViewportCell) -> Bool {
        guard cell.row >= topLeft.row, cell.row <= bottomRight.row else { return false }
        if isRectangle || topLeft.row == bottomRight.row {
            return cell.column >= topLeft.column && cell.column <= bottomRight.column
        }
        if cell.row == topLeft.row { return cell.column >= topLeft.column }
        if cell.row == bottomRight.row { return cell.column <= bottomRight.column }
        return true
    }
}
