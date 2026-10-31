//
//  UITerminalView+PinchZoom.swift
//  libghostty-spm
//

#if canImport(UIKit)
    #if !targetEnvironment(macCatalyst)
        import UIKit

        /// Pinch gesture state; behavior lives in +PinchZoom. The font size the
        /// pinch steps is not kept here: the coordinator tracks it for every
        /// platform and every path that zooms (`fontSize`).
        struct FontZoomState {
            var lastPinchScale: CGFloat = 1.0
        }

        extension UITerminalView {
            static let minFontSize: Float = 4
            static let maxFontSize: Float = 64
            private static let scaleStepThreshold: CGFloat = 0.1

            func setupPinchZoomGesture() {
                let pinch = UIPinchGestureRecognizer(
                    target: self,
                    action: #selector(handlePinchGesture(_:)),
                )
                addGestureRecognizer(pinch)
            }

            @objc func handlePinchGesture(_ gesture: UIPinchGestureRecognizer) {
                switch gesture.state {
                case .began:
                    softwareKeyboard.tapCandidateArmed = false
                    stopMomentumScrolling()
                    dismissTouchSelection()
                    fontZoom.lastPinchScale = gesture.scale
                    TerminalDebugLog.log(
                        .actions,
                        "pinch began scale=\(String(format: "%.3f", gesture.scale)) fontSize=\(fontSizeDescription)",
                    )

                case .changed:
                    let delta = gesture.scale - fontZoom.lastPinchScale

                    let steps = Int(delta / Self.scaleStepThreshold)
                    guard steps != 0 else { return }

                    fontZoom.lastPinchScale += CGFloat(steps) * Self.scaleStepThreshold
                    TerminalDebugLog.log(
                        .actions,
                        "pinch changed scale=\(String(format: "%.3f", gesture.scale)) delta=\(String(format: "%.3f", delta)) steps=\(steps)",
                    )

                    // Each step goes through the binding, which moves the
                    // tracked size as it lands; the pinch's own 4…64 range is
                    // checked against that size before every step.
                    var changed = false
                    if steps > 0 {
                        for _ in 0 ..< steps {
                            guard let size = fontSize, size < Self.maxFontSize,
                                  surface?.performBindingAction("increase_font_size:1") == true
                            else { break }
                            changed = true
                        }
                    } else {
                        for _ in 0 ..< abs(steps) {
                            guard let size = fontSize, size > Self.minFontSize,
                                  surface?.performBindingAction("decrease_font_size:1") == true
                            else { break }
                            changed = true
                        }
                    }

                    if changed {
                        core.synchronizeMetrics()
                        refreshTextInputGeometry(reason: "pinch-zoom")
                        TerminalDebugLog.log(
                            .actions,
                            "pinch applied fontSize=\(fontSizeDescription)",
                        )
                    }

                case .ended, .cancelled, .failed:
                    fontZoom.lastPinchScale = 1.0
                    TerminalDebugLog.log(
                        .actions,
                        "pinch ended state=\(gesture.state.rawValue) fontSize=\(fontSizeDescription)",
                    )

                default:
                    break
                }
            }

            private var fontSizeDescription: String {
                fontSize.map { "\($0)" } ?? "nil"
            }
        }
    #endif
#endif
