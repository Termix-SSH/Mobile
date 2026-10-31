//
//  UITerminalView+TouchSelectionLoupe.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit

    /// The system text loupe over a dragged selection endpoint, iOS 17+.
    /// One session per drag; earlier systems and visionOS show none.
    @MainActor
    final class TerminalTouchSelectionLoupe {
        /// Erased so the package still deploys to iOS 15.
        private var session: AnyObject?

        init(at point: CGPoint, from widget: UIView?, in view: UIView) {
            #if !os(visionOS)
                if #available(iOS 17.0, *) {
                    session = UITextLoupeSession.begin(at: point, fromSelectionWidgetView: widget, in: view)
                }
            #endif
        }

        func move(to point: CGPoint, caret: CGRect) {
            #if !os(visionOS)
                if #available(iOS 17.0, *), let session = session as? UITextLoupeSession {
                    session.move(to: point, withCaretRect: caret, trackingCaret: !caret.isNull)
                }
            #endif
        }

        func invalidate() {
            #if !os(visionOS)
                if #available(iOS 17.0, *) {
                    (session as? UITextLoupeSession)?.invalidate()
                }
            #endif
            session = nil
        }

        isolated deinit { invalidate() }
    }

    extension UITerminalView {
        func beginTouchSelectionLoupe(at point: CGPoint, from widget: UIView?) {
            endTouchSelectionLoupe()
            guard usesTouchSelectionLoupe, window != nil else { return }
            touchSelection.loupe = TerminalTouchSelectionLoupe(at: point, from: widget, in: self)
            moveTouchSelectionLoupe(to: point)
        }

        /// Follows the finger and snaps to the endpoint that is moving:
        /// the bound the drag has carried away from the fixed pivot.
        func moveTouchSelectionLoupe(to point: CGPoint) {
            guard let loupe = touchSelection.loupe else { return }
            guard let range = touchSelection.range, let grid = touchSelection.grid else {
                endTouchSelectionLoupe()
                return
            }
            let movesStart = range.lowerBound < (touchSelection.pivot?.lowerBound ?? range.lowerBound)
            let cell = movesStart ? range.lowerBound : range.upperBound
            let row = cell / grid.columns - touchViewportOffset
            var caret = CGRect.null
            if row >= 0, row < grid.rows {
                let rect = grid.rect(for: cell, viewportOffset: touchViewportOffset)
                caret = touchSelectionLoupeCaretRect(forEndpointCell: rect, isStart: movesStart)
            }
            loupe.move(to: point, caret: caret)
        }

        func endTouchSelectionLoupe() {
            touchSelection.loupe?.invalidate()
            touchSelection.loupe = nil
        }
    }
#endif
