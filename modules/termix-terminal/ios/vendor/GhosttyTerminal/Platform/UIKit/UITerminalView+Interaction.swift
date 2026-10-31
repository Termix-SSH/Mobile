//
//  UITerminalView+Interaction.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/17.
//

#if canImport(UIKit)
    import GhosttyKit
    import UIKit

    extension UITerminalView {
        /// How far a finger may wander and still count as a tap.
        static let tapCandidateSlop: CGFloat = 10
        /// How long a press may last and still count as a tap, so a
        /// stationary hold never toggles the keyboard with inline selection
        /// off, where the long-press recognizer refuses to begin.
        static let tapCandidateMaxDuration: TimeInterval = 0.35

        override open func touchesBegan(
            _ touches: Set<UITouch>,
            with event: UIEvent?,
        ) {
            if handleIndirectPointerTouches(touches, phase: .began, event: event) {
                return
            }
            touchSelection.lastInputWasDirect = true
            if let overlay = touchSelection.overlay,
               touches.contains(where: { $0.view?.isDescendant(of: overlay) == true })
            {
                return
            }
            super.touchesBegan(touches, with: event)
            if usesInlineTextSelection {
                return
            }
            #if targetEnvironment(macCatalyst)
                becomeFirstResponder()
            #else
                if momentumScroll.displayLink != nil {
                    // A touch during momentum is a scroll-stop, not a tap.
                    stopMomentumScrolling()
                    softwareKeyboard.tapCandidateArmed = false
                } else if let touch = touches.first,
                          // View-scoped on purpose: `allTouches` spans the
                          // whole app, and a finger resting on host chrome
                          // (sidebar, tab bar) must not swallow a tap here.
                          (event?.touches(for: self)?.count ?? touches.count) == 1
                {
                    softwareKeyboard.tapCandidateArmed = true
                    softwareKeyboard.tapCandidateStart = touch.location(in: self)
                    softwareKeyboard.tapCandidateTimestamp = touch.timestamp
                } else {
                    // A second finger means pinch (or some other
                    // multi-touch gesture) — the sequence can no longer
                    // be a tap.
                    softwareKeyboard.tapCandidateArmed = false
                }
            #endif
        }

        override open func touchesMoved(
            _ touches: Set<UITouch>,
            with event: UIEvent?,
        ) {
            if handleIndirectPointerTouches(touches, phase: .moved, event: event) {
                return
            }
            #if !targetEnvironment(macCatalyst)
                if softwareKeyboard.tapCandidateArmed, let touch = touches.first {
                    let point = touch.location(in: self)
                    let start = softwareKeyboard.tapCandidateStart
                    if hypot(point.x - start.x, point.y - start.y) > Self.tapCandidateSlop {
                        softwareKeyboard.tapCandidateArmed = false
                    }
                }
            #endif
            super.touchesMoved(touches, with: event)
        }

        override open func touchesEnded(
            _ touches: Set<UITouch>,
            with event: UIEvent?,
        ) {
            if handleIndirectPointerTouches(touches, phase: .ended, event: event) {
                return
            }
            if usesInlineTextSelection {
                super.touchesEnded(touches, with: event)
                return
            }
            #if !targetEnvironment(macCatalyst)
                if softwareKeyboard.tapCandidateArmed, let touch = touches.first {
                    softwareKeyboard.tapCandidateArmed = false
                    let duration = touch.timestamp - softwareKeyboard.tapCandidateTimestamp
                    if duration <= Self.tapCandidateMaxDuration {
                        TerminalDebugLog.log(
                            .input,
                            "tap toggles keyboard visible=\(softwareKeyboard.isVisible) duration=\(String(format: "%.3f", duration))",
                        )
                        // The tap is a click first and a keyboard toggle
                        // second, in both directions: a TUI tracking the
                        // mouse gets its press before the resize the
                        // keyboard causes, and the shell sees the
                        // click-to-move at its prompt either way.
                        sendTapClick(at: touch.location(in: self))
                        // Overridable: a host keyboard lock overrides
                        // `toggleSoftwareKeyboard()` to swallow the toggle;
                        // the click above still lands either way.
                        toggleSoftwareKeyboard()
                    }
                }
            #endif
            super.touchesEnded(touches, with: event)
        }

        override open func touchesCancelled(
            _ touches: Set<UITouch>,
            with event: UIEvent?,
        ) {
            if handleIndirectPointerTouches(touches, phase: .cancelled, event: event) {
                return
            }
            #if !targetEnvironment(macCatalyst)
                softwareKeyboard.tapCandidateArmed = false
            #endif
            super.touchesCancelled(touches, with: event)
        }

        func setupPlatformInput() {
            addInteraction(selectionContextMenuInteraction)
            setupDropInput()
            addGestureRecognizer(TerminalScrollWheelGestureRecognizer(
                target: self,
                action: #selector(handleScrollWheelGesture(_:)),
            ))
            let pointerInteraction = UIPointerInteraction(delegate: self)
            addInteraction(pointerInteraction)
            pointer.pointerInteraction = pointerInteraction
            let hover = UIHoverGestureRecognizer(
                target: self,
                action: #selector(handlePointerHover(_:)),
            )
            hover.cancelsTouchesInView = false
            hover.delegate = self
            addGestureRecognizer(hover)
            pointer.hoverRecognizer = hover
            #if !targetEnvironment(macCatalyst)
                setupTouchScrollInput()
            #endif
        }

        #if !targetEnvironment(macCatalyst)
            func setupTouchScrollInput() {
                let gesture = UIPanGestureRecognizer(
                    target: self,
                    action: #selector(handleTouchScrollGesture(_:)),
                )
                gesture.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
                gesture.maximumNumberOfTouches = 1
                gesture.delegate = self
                addGestureRecognizer(gesture)
                touchSelection.scrollGesture = gesture

                let longPress = UILongPressGestureRecognizer(
                    target: self,
                    action: #selector(handleLongPressForSelection(_:)),
                )
                longPress.minimumPressDuration = 0.7
                longPress.allowableMovement = 10
                longPress.numberOfTouchesRequired = 1
                longPress.numberOfTapsRequired = 0
                longPress.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
                longPress.cancelsTouchesInView = false
                longPress.delegate = self
                addGestureRecognizer(longPress)
                touchSelection.longPress = longPress

                setupIndirectPointerSelectionGesture()
                setupPinchZoomGesture()
                setupTouchSelectionGestures()
            }

            /// One left click at `point`, the way a finger tap reaches the
            /// terminal: a press and a release with no drag between them.
            /// Any pointer-drag selection is over by definition — ghostty
            /// clears its selection on the click.
            func sendTapClick(at point: CGPoint) {
                guard let surface else { return }
                let mods = pointerMods()
                sendPointerPosition(at: tapClickPoint(for: point, on: surface))
                surface.sendMouseButton(
                    state: GHOSTTY_MOUSE_PRESS,
                    button: GHOSTTY_MOUSE_LEFT,
                    mods: mods,
                )
                surface.sendMouseButton(
                    state: GHOSTTY_MOUSE_RELEASE,
                    button: GHOSTTY_MOUSE_LEFT,
                    mods: mods,
                )
                pointer.lastSelectionRect = nil
                pointer.selectionStartPoint = nil
            }

            /// Where a tap's click lands. A program tracking the mouse gets
            /// the cell under the finger. Otherwise a tap below the cursor's
            /// row clicks the cursor's own cell: ghostty keeps the clicked
            /// cell pinned until the next press, and a pinned blank row
            /// stops the keyboard's resize from trimming the blank rows
            /// under it, so a tap low on a short screen pushed the lines at
            /// the top into scrollback when the keyboard came up. On the
            /// cursor's row the pin costs nothing — the cursor holds that
            /// row already — and the click still clears a selection.
            func tapClickPoint(for point: CGPoint, on surface: TerminalSurface) -> CGPoint {
                guard !surface.isMouseCaptured else { return point }
                // `imePoint` is the cursor cell's horizontal midpoint and
                // bottom edge, in view points.
                let cursor = surface.imePoint()
                guard cursor.height > 0, point.y > cursor.y else { return point }
                return CGPoint(x: cursor.x, y: cursor.y - cursor.height / 2)
            }

            /// Long press opens the touch menu; with inline selection off
            /// the recognizer never begins (see `gestureRecognizerShouldBegin`).
            @objc func handleLongPressForSelection(
                _ gesture: UILongPressGestureRecognizer,
            ) {
                guard gesture.state == .began, usesInlineTextSelection else { return }
                softwareKeyboard.tapCandidateArmed = false
                presentTouchMenu(at: gesture.location(in: self))
            }
        #endif

        /// Touches on the selection handles belong to the overlay's own pan
        /// recognizers. A single tap records, before UIKit can dismiss the
        /// edit menu, whether it began with the menu open or a fling running.
        public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            if let overlay = touchSelection.overlay, touch.view?.isDescendant(of: overlay) == true {
                return false
            }
            if usesInlineTextSelection, gestureRecognizer === touchSelection.tapRecognizers.first {
                touchSelection.tapBeganWithMenu = isTouchMenuVisible
                touchSelection.tapStopsMomentum = momentumScroll.displayLink != nil
                if touchSelection.tapStopsMomentum {
                    stopMomentumScrolling()
                }
            }
            return true
        }

        /// Gate the long-press recognizer at the gesture layer while inline
        /// selection is off (always on Mac Catalyst). Without this, the
        /// recognizer still enters the touch arena and can subtly delay pan
        /// recognition for hosts that opted out.
        override open func gestureRecognizerShouldBegin(
            _ gestureRecognizer: UIGestureRecognizer,
        ) -> Bool {
            if gestureRecognizer is UILongPressGestureRecognizer {
                return usesInlineTextSelection
            }
            return true
        }
    }
#endif
