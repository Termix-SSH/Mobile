//
//  TerminalTouchSelectionOverlay.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit

    /// Transparent terminal-local selection chrome. Only handles intercept hits.
    final class TerminalTouchSelectionOverlay: UIView {
        enum Endpoint {
            case start
            case end
        }

        let startHandle = UIView()
        let endHandle = UIView()
        var onDrag: ((Endpoint, UIPanGestureRecognizer) -> Void)?
        private let highlight = CAShapeLayer()
        private let startMark = CAShapeLayer()
        private let endMark = CAShapeLayer()
        private var presentation: Presentation?

        private struct Presentation: Equatable {
            let grid: TerminalSelectionGrid
            let range: ClosedRange<Int>
            let offset: Int
            /// The highlight itself, row shapes included: the same range can
            /// cover different text once the program redraws under it.
            let rects: [CGRect]
            let bounds: CGRect
            let tint: UIColor
        }

        override init(frame: CGRect) {
            super.init(frame: frame)
            isOpaque = false
            backgroundColor = .clear
            layer.addSublayer(highlight)
            for (handle, mark, identifier) in [
                (startHandle, startMark, "terminal.selection.start"),
                (endHandle, endMark, "terminal.selection.end"),
            ] {
                handle.layer.addSublayer(mark)
                handle.accessibilityIdentifier = identifier
                handle.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(drag(_:))))
                addSubview(handle)
            }
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("init(coder:) has not been implemented")
        }

        override func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
            [startHandle, endHandle].contains { !$0.isHidden && $0.frame.contains(point) }
        }

        override func hitTest(_ point: CGPoint, with _: UIEvent?) -> UIView? {
            // Tiny selections have overlapping 44-point targets. Choose the
            // nearest endpoint so both handles remain reachable.
            [startHandle, endHandle]
                .filter { !$0.isHidden && $0.frame.contains(point) }
                .min {
                    hypot($0.center.x - point.x, $0.center.y - point.y)
                        < hypot($1.center.x - point.x, $1.center.y - point.y)
                }
        }

        func update(
            grid: TerminalSelectionGrid,
            range: ClosedRange<Int>,
            offset: Int,
            textCells: ((Int) -> ClosedRange<Int>?)? = nil,
        ) {
            let next = Presentation(
                grid: grid, range: range, offset: offset,
                rects: grid.rects(for: range, viewportOffset: offset, textCells: textCells),
                bounds: bounds, tint: tintColor.resolvedColor(with: traitCollection),
            )
            guard next != presentation else { return }
            presentation = next
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            let path = UIBezierPath()
            for rect in next.rects {
                path.append(UIBezierPath(rect: rect))
            }
            highlight.path = path.cgPath
            highlight.fillColor = next.tint.withAlphaComponent(0.3).cgColor
            for (cell, handle, mark, isStart) in [
                (range.lowerBound, startHandle, startMark, true),
                (range.upperBound, endHandle, endMark, false),
            ] {
                let rect = grid.rect(for: cell, viewportOffset: offset)
                handle.isHidden = cell / grid.columns < offset || cell / grid.columns >= offset + grid.rows
                let x = isStart ? rect.minX : rect.maxX
                handle.frame = CGRect(x: x - 22, y: rect.midY - 22, width: 44, height: 44)
                let stem = CGRect(x: 21, y: 22 - rect.height / 2, width: 2, height: rect.height)
                let proposedY = isStart ? stem.minY - 5 : stem.maxY + 5
                let knobY = min(bounds.maxY - handle.frame.minY - 5, max(5 - handle.frame.minY, proposedY))
                let shape = UIBezierPath(rect: stem)
                shape.append(UIBezierPath(ovalIn: CGRect(x: 17, y: knobY - 5, width: 10, height: 10)))
                mark.path = shape.cgPath
                mark.fillColor = next.tint.cgColor
            }
            CATransaction.commit()
        }

        /// The highlight and both visible handles, knobs included. The edit
        /// menu is placed outside this rect so it never covers a handle.
        var menuAvoidanceRect: CGRect? {
            var rect = highlight.path?.boundingBoxOfPath ?? .null
            for handle in [startHandle, endHandle] where !handle.isHidden {
                rect = rect.union(handle.frame)
            }
            return rect.isNull ? nil : rect.intersection(bounds)
        }

        @objc private func drag(_ gesture: UIPanGestureRecognizer) {
            onDrag?(gesture.view === startHandle ? .start : .end, gesture)
        }
    }
#endif
