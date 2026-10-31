//
//  PlatformLink+UIKit.swift
//  DisplayLink
//

#if canImport(UIKit)
    import UIKit

    typealias PlatformView = UIView

    #if os(visionOS)
        /// visionOS has no screens to tell apart: every window shares one link.
        struct Display: Hashable {
            static let primary = Display()

            var isConnected: Bool {
                true
            }

            @MainActor
            static func showing(_ view: UIView) -> Display? {
                (view as? UIWindow ?? view.window) == nil ? nil : primary
            }
        }
    #else
        typealias Display = UIScreen

        extension UIScreen {
            static var primary: UIScreen {
                .main
            }

            var isConnected: Bool {
                UIScreen.screens.contains(self)
            }

            static func showing(_ view: UIView) -> UIScreen? {
                (view as? UIWindow ?? view.window)?.screen
            }
        }
    #endif

    /// The system link for one display, ticking on the main run loop until
    /// released.
    @MainActor
    final class PlatformLink {
        private let link: CADisplayLink

        init?(display: Display, frameRateRange: DisplayLinkFrameRateRange, onFrame: @escaping @MainActor (DisplayLinkFrame) -> Void) {
            // CADisplayLink retains its target, so the target must not own us.
            let target = FrameTarget(onFrame: onFrame)
            let selector = #selector(FrameTarget.tick(_:))
            #if os(visionOS)
                link = CADisplayLink(target: target, selector: selector)
            #else
                guard let link = display.displayLink(withTarget: target, selector: selector) else { return nil }
                self.link = link
            #endif
            link.preferredFrameRateRange = CAFrameRateRange(
                minimum: frameRateRange.minimum,
                maximum: frameRateRange.maximum,
                preferred: frameRateRange.preferred,
            )
            link.add(to: .main, forMode: .common)
        }

        deinit {
            MainActor.assumeIsolated { link.invalidate() }
        }
    }

    @MainActor
    private final class FrameTarget: NSObject {
        let onFrame: @MainActor (DisplayLinkFrame) -> Void

        init(onFrame: @escaping @MainActor (DisplayLinkFrame) -> Void) {
            self.onFrame = onFrame
        }

        @objc func tick(_ link: CADisplayLink) {
            onFrame(DisplayLinkFrame(timestamp: link.timestamp, targetTimestamp: link.targetTimestamp))
        }
    }

    extension SharedDisplayLink {
        /// A backgrounded app draws nothing, so its links are released until
        /// it returns. Screens coming and going can move windows between them.
        static func observeSystemEvents() {
            let center = NotificationCenter.default
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { isSuspended = true }
            }
            center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { isSuspended = false }
            }
            #if !os(visionOS)
                for name in [UIScreen.didConnectNotification, UIScreen.didDisconnectNotification] {
                    center.addObserver(forName: name, object: nil, queue: .main) { _ in
                        MainActor.assumeIsolated { displaysDidChange() }
                    }
                }
            #endif
        }
    }
#endif
