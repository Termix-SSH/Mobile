//
//  UITerminalView+Pointer.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import GhosttyKit
    import UIKit
    #if canImport(GameController)
        import GameController
    #endif

    /// Mouse/trackpad interaction state; behavior lives in +Interaction.
    struct PointerInteractionState {
        var session = TerminalPointerButtonSession()
        var lastLocation: CGPoint?
        var hoverRecognizer: UIHoverGestureRecognizer?
        var pointerInteraction: UIPointerInteraction?
        var selectionStartPoint: CGPoint?
        var lastSelectionRect: CGRect?
        var pendingSelectionMenuPoint: CGPoint?
        /// Capture sampled at the matching press. Nil when no button is down.
        var gestureCaptured: Bool?
        var panOwnsTouchSequence = false
        var suppressNextTouchEnd = false
        var mouseShape: TerminalMouseShape = .default

        var activeButton: ghostty_input_mouse_button_e? {
            session.reported
        }
    }

    extension UITerminalView {
        @objc func handlePointerHover(_ gesture: UIHoverGestureRecognizer) {
            switch gesture.state {
            case .began, .changed:
                let point = gesture.location(in: self)
                pointer.lastLocation = point
                guard pointer.session.reported == nil else { return }
                sendPointerPosition(at: point, remember: false)
            default:
                break
            }
        }

        enum IndirectPointerPhase {
            case began
            case moved
            case ended
            case cancelled
        }

        func handleIndirectPointerTouches(
            _ touches: Set<UITouch>,
            phase: IndirectPointerPhase,
            event: UIEvent?,
        ) -> Bool {
            let hasIndirectPointerTouch = touches.contains { $0.type == .indirectPointer }

            #if !targetEnvironment(macCatalyst)
                if pointer.suppressNextTouchEnd, hasIndirectPointerTouch {
                    if phase == .ended || phase == .cancelled {
                        pointer.suppressNextTouchEnd = false
                        return true
                    }
                    pointer.suppressNextTouchEnd = false
                }

                if pointer.panOwnsTouchSequence, hasIndirectPointerTouch {
                    if phase == .began {
                        pointer.panOwnsTouchSequence = false
                    } else {
                        return true
                    }
                }
            #endif

            guard hasIndirectPointerTouch,
                  let touch = touches.first(where: { $0.type == .indirectPointer })
            else {
                return false
            }

            touchSelection.lastInputWasDirect = false
            if phase == .began {
                dismissTouchSelection()
            }
            core.setFocus(true)
            // A pointer click claims keyboard focus the way a finger tap
            // does — without this, clicking a terminal with a mouse or
            // trackpad never made it first responder and hardware keys kept
            // going to whatever held focus before.
            if phase == .began, !isFirstResponder {
                becomeFirstResponder()
            }
            stopMomentumScrolling()

            let button = pointerButton(from: event)
            let location = touch.location(in: self)
            TerminalDebugLog.log(
                .input,
                "pointer touch phase=\(phase) type=\(touch.type.rawValue) button=\(button.rawValue) location=\(NSCoder.string(for: location)) mask=\(event?.buttonMask.rawValue ?? 0)",
            )

            switch phase {
            case .began:
                if button == GHOSTTY_MOUSE_RIGHT,
                   TerminalPointerPolicy.shouldPresentHostSecondaryMenu(
                       mouseCaptured: surface?.isMouseCaptured == true,
                   ),
                   let menuPoint = selectionMenuPoint(at: location)
                {
                    pointer.pendingSelectionMenuPoint = menuPoint
                    pointer.gestureCaptured = false
                    return true
                }

                pointer.pendingSelectionMenuPoint = nil
                pointer.gestureCaptured = surface?.isMouseCaptured == true
                if button == GHOSTTY_MOUSE_LEFT {
                    pointer.selectionStartPoint = location
                }
                sendPointerPosition(at: location)
                if let sent = pointer.session.press(button) {
                    surface?.sendMouseButton(
                        state: GHOSTTY_MOUSE_PRESS,
                        button: sent,
                        mods: pointerMods(),
                    )
                }

            case .moved:
                sendPointerPosition(at: location)
                if pointer.gestureCaptured != true {
                    updatePointerSelectionRect(to: location)
                }

            case .ended:
                if pointer.pendingSelectionMenuPoint != nil {
                    if selectionMenuPoint(at: location) != nil {
                        showSelectionCopyMenu(at: location)
                    }
                    pointer.pendingSelectionMenuPoint = nil
                    pointer.gestureCaptured = nil
                    return true
                }

                sendPointerPosition(at: location)
                let released = pointer.session.reported
                if let sent = pointer.session.finish() {
                    surface?.sendMouseButton(
                        state: GHOSTTY_MOUSE_RELEASE,
                        button: sent,
                        mods: pointerMods(),
                    )
                }
                if released == GHOSTTY_MOUSE_LEFT {
                    finishPointerSelection(at: location)
                }
                pointer.gestureCaptured = nil
                pointer.pendingSelectionMenuPoint = nil

            case .cancelled:
                cancelReportedPointerButton(at: location)
            }

            return true
        }

        func pointerButton(from event: UIEvent?) -> ghostty_input_mouse_button_e {
            guard let event else { return GHOSTTY_MOUSE_LEFT }
            let mask = event.buttonMask
            var extra: Int?
            for number in TerminalPointerPolicy.extraButtonRange where mask.contains(.button(number)) {
                extra = number
                break
            }
            return TerminalPointerPolicy.ghosttyButton(
                secondary: mask.contains(.secondary),
                middle: mask.contains(.button(3)),
                extraButtonNumber: extra,
            )
        }

        func pointerMods() -> ghostty_input_mods_e {
            if let hover = pointer.hoverRecognizer,
               hover.state == .began || hover.state == .changed
            {
                return TerminalInputModifiers(from: hover.modifierFlags).ghosttyMods
            }
            #if !targetEnvironment(macCatalyst) && canImport(GameController)
                if let live = gameControllerPointerMods() {
                    return live
                }
            #endif
            #if targetEnvironment(macCatalyst)
                if hardwareKeyboard.heldModifierFlags.isEmpty, let flags = CGEvent(source: nil)?.flags {
                    var mods = TerminalInputModifiers()
                    if flags.contains(.maskCommand) {
                        mods.insert(.super_)
                    }
                    if flags.contains(.maskControl) {
                        mods.insert(.ctrl)
                    }
                    if flags.contains(.maskShift) {
                        mods.insert(.shift)
                    }
                    if flags.contains(.maskAlternate) {
                        mods.insert(.alt)
                    }
                    return mods.ghosttyMods
                }
            #endif
            return TerminalInputModifiers(from: hardwareKeyboard.heldModifierFlags)
                .ghosttyMods
        }

        #if !targetEnvironment(macCatalyst) && canImport(GameController)
            func gameControllerPointerMods() -> ghostty_input_mods_e? {
                guard let keyboard = GCKeyboard.coalesced?.keyboardInput else { return nil }
                let pressed: (GCKeyCode) -> Bool = { key in
                    keyboard.button(forKeyCode: key)?.isPressed == true
                }
                var mods = TerminalInputModifiers()
                if pressed(.leftShift) || pressed(.rightShift) {
                    mods.insert(.shift)
                }
                if pressed(.leftControl) || pressed(.rightControl) {
                    mods.insert(.ctrl)
                }
                if pressed(.leftAlt) || pressed(.rightAlt) {
                    mods.insert(.alt)
                }
                if pressed(.leftGUI) || pressed(.rightGUI) {
                    mods.insert(.super_)
                }
                return mods.ghosttyMods
            }
        #endif

        /// The pointer style is region-scoped, so it needs no reset when
        /// the pointer leaves the view; `invalidate` re-asks the delegate
        /// while the pointer is already inside.
        func applyMouseShape(_ raw: ghostty_action_mouse_shape_e) {
            pointer.mouseShape = TerminalMouseShape(raw)
            pointer.pointerInteraction?.invalidate()
        }

        /// View points. Ghostty applies `content_scale` internally.
        func sendPointerPosition(at point: CGPoint, remember: Bool = true) {
            if remember {
                pointer.lastLocation = point
            }
            surface?.sendMousePos(
                x: Double(point.x),
                y: Double(point.y),
                mods: pointerMods(),
            )
        }

        func refreshPointerPositionForModifierChange() {
            guard pointer.session.reported == nil,
                  let point = pointer.lastLocation
            else { return }
            sendPointerPosition(at: point, remember: false)
        }

        func cancelReportedPointerButton(at point: CGPoint? = nil) {
            if let point {
                sendPointerPosition(at: point)
            }
            if let sent = pointer.session.cancel() {
                surface?.sendMouseButton(
                    state: GHOSTTY_MOUSE_RELEASE,
                    button: sent,
                    mods: pointerMods(),
                )
            }
            pointer.pendingSelectionMenuPoint = nil
            pointer.gestureCaptured = nil
            pointer.selectionStartPoint = nil
        }

        func updatePointerSelectionRect(to point: CGPoint) {
            guard let start = pointer.selectionStartPoint else { return }

            pointer.lastSelectionRect = CGRect(
                x: min(start.x, point.x),
                y: min(start.y, point.y),
                width: abs(start.x - point.x),
                height: abs(start.y - point.y),
            ).insetBy(dx: -2, dy: -2)
            logPointerSelectionDiagnostics(
                context: "updatePointerSelectionRect",
                point: point,
            )
        }

        func finishPointerSelection(at point: CGPoint) {
            defer { pointer.selectionStartPoint = nil }
            guard let start = pointer.selectionStartPoint else { return }
            let dragDistance = hypot(point.x - start.x, point.y - start.y)
            if dragDistance < 2 {
                pointer.lastSelectionRect = nil
            } else {
                updatePointerSelectionRect(to: point)
            }
            logPointerSelectionDiagnostics(
                context: "finishPointerSelection",
                point: point,
            )
        }

        func logPointerSelectionDiagnostics(context: String, point: CGPoint) {
            guard TerminalDebugLog.isEnabled,
                  TerminalDebugLog.categories.contains(.input)
            else { return }

            let rectDescription = pointer.lastSelectionRect.map {
                NSCoder.string(for: $0)
            } ?? "nil"
            let metricsDescription = surface?.size().map(\.debugSummary) ?? "nil"
            let selection = surface?.readSelectionResult()
            let selectionDescription = selection.map {
                "text=\(TerminalDebugLog.describe($0.text)) offset=\($0.offsetStart)+\($0.offsetLength)"
            } ?? "nil"
            let word = surface?.quicklookWord()
            let wordDescription = word.map {
                "word=\(TerminalDebugLog.describe($0.word)) offset=\($0.offsetStart)+\($0.offsetLength) point=\(String(format: "%.2f", $0.pointX))x\(String(format: "%.2f", $0.pointY))"
            } ?? "nil"
            TerminalDebugLog.log(
                .input,
                "pointer selection \(context) viewBounds=\(NSCoder.string(for: bounds)) point=\(NSCoder.string(for: point)) rect=\(rectDescription) metrics=\(metricsDescription) selection=\(selectionDescription) quicklook=\(wordDescription)",
            )
        }

        #if !targetEnvironment(macCatalyst)
            func setupIndirectPointerSelectionGesture() {
                let gesture = UIPanGestureRecognizer(
                    target: self,
                    action: #selector(handleIndirectPointerSelectionGesture(_:)),
                )
                gesture.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.indirectPointer.rawValue)]
                gesture.minimumNumberOfTouches = 1
                gesture.maximumNumberOfTouches = 1
                gesture.cancelsTouchesInView = false
                gesture.delaysTouchesBegan = false
                gesture.delaysTouchesEnded = false
                addGestureRecognizer(gesture)
            }

            @objc func handleIndirectPointerSelectionGesture(
                _ gesture: UIPanGestureRecognizer,
            ) {
                let location = gesture.location(in: self)
                TerminalDebugLog.log(
                    .input,
                    "indirect pointer gesture state=\(gesture.state.rawValue) location=\(NSCoder.string(for: location)) translation=\(NSCoder.string(for: gesture.translation(in: self)))",
                )

                switch gesture.state {
                case .began:
                    if let reported = pointer.session.reported,
                       reported != GHOSTTY_MOUSE_LEFT
                    {
                        return
                    }
                    core.setFocus(true)
                    stopMomentumScrolling()
                    pointer.panOwnsTouchSequence = true
                    if pointer.gestureCaptured == nil {
                        pointer.gestureCaptured = surface?.isMouseCaptured == true
                    }
                    if pointer.session.reported != GHOSTTY_MOUSE_LEFT,
                       let sent = pointer.session.press(GHOSTTY_MOUSE_LEFT)
                    {
                        surface?.sendMouseButton(
                            state: GHOSTTY_MOUSE_PRESS,
                            button: sent,
                            mods: pointerMods(),
                        )
                    }
                    if pointer.selectionStartPoint == nil {
                        pointer.selectionStartPoint = location
                    }
                    pointer.pendingSelectionMenuPoint = nil
                    sendPointerPosition(at: location)

                case .changed:
                    if pointer.gestureCaptured != true {
                        updatePointerSelectionRect(to: location)
                    }
                    sendPointerPosition(at: location)

                case .ended:
                    if pointer.gestureCaptured != true {
                        updatePointerSelectionRect(to: location)
                    }
                    sendPointerPosition(at: location)
                    if let sent = pointer.session.finish() {
                        surface?.sendMouseButton(
                            state: GHOSTTY_MOUSE_RELEASE,
                            button: sent,
                            mods: pointerMods(),
                        )
                    }
                    finishPointerSelection(at: location)
                    pointer.panOwnsTouchSequence = false
                    pointer.suppressNextTouchEnd = true
                    pointer.gestureCaptured = nil

                case .cancelled, .failed:
                    pointer.panOwnsTouchSequence = false
                    pointer.suppressNextTouchEnd = true
                    pointer.lastSelectionRect = nil
                    cancelReportedPointerButton(at: location)

                default:
                    break
                }
            }
        #endif
    }

    extension UITerminalView: UIGestureRecognizerDelegate {
        public func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer,
        ) -> Bool {
            gestureRecognizer === pointer.hoverRecognizer
                || otherGestureRecognizer === pointer.hoverRecognizer
        }
    }

    extension UITerminalView: UIPointerInteractionDelegate {
        public func pointerInteraction(
            _: UIPointerInteraction,
            styleFor _: UIPointerRegion,
        ) -> UIPointerStyle? {
            switch pointer.mouseShape {
            case .text:
                UIPointerStyle(shape: .verticalBeam(length: 24))
            case .pointer, .notAllowed, .default, .other:
                nil
            }
        }
    }
#endif
