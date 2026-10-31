//
//  AppTerminalView+PublicSelection.swift
//  libghostty-spm
//
//  Where the selection lies, for hosts that act on a press over it —
//  dragging the selected text out, as NSTextView does.
//

#if !canImport(UIKit) && canImport(AppKit)
    import AppKit

    public extension AppTerminalView {
        /// Where the selection lies on screen, nil when there is none or
        /// none of it is in view. See ``TerminalSurface/selectionRegion()``.
        var selectionRegion: TerminalSelectionRegion? {
            surface?.selectionRegion()
        }

        /// The viewport cell under `point`, in this view's coordinate
        /// system: `convert(event.locationInWindow, from: nil)`.
        func viewportCell(at point: NSPoint) -> TerminalViewportCell? {
            surface?.viewportCell(at: surfacePoint(point), scale: CGFloat(core.scaleFactor()))
        }

        /// Whether the cell under `point` (this view's coordinates) is
        /// selected. Ask it in `mouseDown` before calling `super`: true is
        /// a press on the selection, to hold for a drag; false, Ghostty's
        /// to start a new selection with.
        func selectionContains(_ point: NSPoint) -> Bool {
            surface?.selectionContains(surfacePoint(point), scale: CGFloat(core.scaleFactor())) ?? false
        }
    }

    extension AppTerminalView {
        /// The surface's top-left origin, as `mousePoint(from:)` sends it.
        func surfacePoint(_ point: NSPoint) -> CGPoint {
            CGPoint(x: point.x, y: bounds.height - point.y)
        }
    }
#endif
