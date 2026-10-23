import Foundation

#if !canImport(UIKit) && canImport(AppKit)
    import AppKit

    typealias DisplayLinkDriverHelper = CVDisplayLinkDriverHelper

    class CVDisplayLinkDriverHelper: DisplayLinkDriverHelperBase {
        nonisolated(unsafe) static let shared = CVDisplayLinkDriverHelper()

        private var displayLink: CVDisplayLink?

        override func startDisplayLink() {
            assert(Thread.isMainThread)
            guard displayLink == nil else { return }
            CVDisplayLinkCreateWithActiveCGDisplays(&displayLink)
            guard let displayLink else { return }

            CVDisplayLinkSetOutputCallback(displayLink, { _, inNow, inOutputTime, _, _, _ in
                let clockFrequency = CVGetHostClockFrequency()
                let context = DisplayLinkCallbackContext(
                    duration: TimeInterval(inNow.pointee.videoRefreshPeriod) / TimeInterval(inNow.pointee.videoTimeScale),
                    timestamp: TimeInterval(inNow.pointee.hostTime) / clockFrequency,
                    targetTimestamp: TimeInterval(inOutputTime.pointee.hostTime) / clockFrequency
                )
                assert(!Thread.isMainThread)
                DispatchQueue.main.async {
                    autoreleasepool {
                        CVDisplayLinkDriverHelper.shared.dispatchUpdate(context: context)
                    }
                }
                return kCVReturnSuccess
            }, nil)
            CVDisplayLinkStart(displayLink)
        }

        override func stopDisplayLink() {
            assert(Thread.isMainThread)
            if let displayLink { CVDisplayLinkStop(displayLink) }
            displayLink = nil
        }
    }
#endif
