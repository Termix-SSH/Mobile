//
//  PlatformLink+AppKit.swift
//  DisplayLink
//

#if !canImport(UIKit) && canImport(AppKit)
    import AppKit

    typealias PlatformView = NSView

    struct Display: Hashable {
        let id: CGDirectDisplayID

        init(id: CGDirectDisplayID) {
            self.id = id
        }

        init(_ screen: NSScreen) {
            let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
            id = number?.uint32Value ?? CGMainDisplayID()
        }

        /// Asking the window server costs microseconds per call, which adds up
        /// over thousands of links; the answers only change when displays do.
        @MainActor private static var cachedPrimary: Display?
        @MainActor private static var cachedConnected: Set<Display>?
        @MainActor private static var cachedScreens: [ObjectIdentifier: Display] = [:]

        @MainActor
        static var primary: Display {
            if let cachedPrimary {
                return cachedPrimary
            }
            let primary = Display(id: CGMainDisplayID())
            cachedPrimary = primary
            return primary
        }

        @MainActor
        var isConnected: Bool {
            if let cachedConnected = Self.cachedConnected {
                return cachedConnected.contains(self)
            }
            let connected = Set(NSScreen.screens.map(Display.init))
            Self.cachedConnected = connected
            return connected.contains(self)
        }

        @MainActor
        static func displaysDidChange() {
            cachedPrimary = nil
            cachedConnected = nil
            cachedScreens = [:]
        }

        @MainActor
        static func showing(_ view: NSView) -> Display? {
            guard let screen = view.window?.screen else { return nil }
            if let display = cachedScreens[ObjectIdentifier(screen)] {
                return display
            }
            let display = Display(screen)
            cachedScreens[ObjectIdentifier(screen)] = display
            return display
        }
    }

    /// The system link for one display. CVDisplayLink ticks on its own thread
    /// at the display's rate; frames are skipped down to the preferred rate and
    /// handed to the main thread one at a time, dropping any that arrive while
    /// the last is still queued, as CADisplayLink does.
    @MainActor
    final class PlatformLink {
        private let link: CVDisplayLink

        init?(display: Display, frameRateRange: DisplayLinkFrameRateRange, onFrame: @escaping @MainActor (DisplayLinkFrame) -> Void) {
            var created: CVDisplayLink?
            // Fails while every display is asleep; displaysDidChange() retries.
            guard CVDisplayLinkCreateWithCGDisplay(display.id, &created) == kCVReturnSuccess,
                  let link = created
            else { return nil }
            self.link = link

            let delivery = FrameDelivery(frameRateRange: frameRateRange, onFrame: onFrame)
            CVDisplayLinkSetOutputHandler(link) { _, now, output, _, _ in
                delivery.enqueue(DisplayLinkFrame(
                    timestamp: Self.seconds(fromHostTime: now.pointee.hostTime),
                    targetTimestamp: Self.seconds(fromHostTime: output.pointee.hostTime),
                ))
                return kCVReturnSuccess
            }
            guard CVDisplayLinkStart(link) == kCVReturnSuccess else { return nil }
        }

        deinit {
            MainActor.assumeIsolated { _ = CVDisplayLinkStop(link) }
        }

        private nonisolated static func seconds(fromHostTime hostTime: UInt64) -> TimeInterval {
            TimeInterval(hostTime) / CVGetHostClockFrequency()
        }
    }

    /// Carries frames from the CVDisplayLink thread to the main thread.
    private final class FrameDelivery: @unchecked Sendable {
        private let onFrame: @MainActor (DisplayLinkFrame) -> Void
        /// Seconds between delivered frames; zero delivers every refresh.
        private let interval: TimeInterval
        private let lock = NSLock()
        private var isFrameQueued = false
        /// Only touched from the CVDisplayLink thread, which calls serially.
        private var lastDelivered: TimeInterval = 0

        init(frameRateRange: DisplayLinkFrameRateRange, onFrame: @escaping @MainActor (DisplayLinkFrame) -> Void) {
            let rate = frameRateRange.preferred > 0 ? frameRateRange.preferred : frameRateRange.maximum
            interval = rate > 0 ? 1 / TimeInterval(rate) : 0
            self.onFrame = onFrame
        }

        func enqueue(_ frame: DisplayLinkFrame) {
            // Half a refresh of slack keeps a rate the display divides evenly
            // (30 on 120 Hz) from slipping a frame to timing jitter.
            let refresh = frame.duration
            guard frame.timestamp - lastDelivered >= interval - refresh / 2 else { return }
            lastDelivered = frame.timestamp
            // This link's next frame is whole refreshes away, as a CADisplayLink
            // at this rate would report it; callers step animations by it.
            let refreshesPerFrame = max(1, (interval / refresh).rounded())
            let frame = DisplayLinkFrame(timestamp: frame.timestamp, targetTimestamp: frame.timestamp + refreshesPerFrame * refresh)

            let isFirst = lock.withLock {
                defer { isFrameQueued = true }
                return !isFrameQueued
            }
            guard isFirst else { return }
            DispatchQueue.main.async { [self] in
                lock.withLock { isFrameQueued = false }
                MainActor.assumeIsolated { onFrame(frame) }
            }
        }
    }

    extension SharedDisplayLink {
        /// Windows change displays when moved, and displays come, go, sleep and
        /// wake; each can leave a link on a display that no longer shows it.
        static func observeSystemEvents() {
            let changes: [(NotificationCenter, Notification.Name)] = [
                (.default, NSWindow.didChangeScreenNotification),
                (.default, NSApplication.didChangeScreenParametersNotification),
                (NSWorkspace.shared.notificationCenter, NSWorkspace.screensDidWakeNotification),
            ]
            for (center, name) in changes {
                center.addObserver(forName: name, object: nil, queue: .main) { _ in
                    MainActor.assumeIsolated {
                        Display.displaysDidChange()
                        displaysDidChange()
                    }
                }
            }
        }
    }
#endif
