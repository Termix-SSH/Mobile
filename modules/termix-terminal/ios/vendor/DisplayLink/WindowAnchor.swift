//
//  WindowAnchor.swift
//  DisplayLink
//

#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

/// An invisible subview that reports when its host view enters or leaves a
/// window. UIKit and AppKit only tell the view itself, so a link bound to a
/// view it does not own learns it through this subview.
///
/// It covers the host's bounds and resizes with it, so layout code that
/// measures or positions subviews never meets a zero-size view.
@MainActor
final class WindowAnchor: PlatformView {
    private let onWindowChange: @MainActor () -> Void

    init(attachingTo host: PlatformView, onWindowChange: @escaping @MainActor () -> Void) {
        self.onWindowChange = onWindowChange
        super.init(frame: host.bounds)
        isHidden = true
        #if canImport(UIKit)
            autoresizingMask = [.flexibleWidth, .flexibleHeight]
            isUserInteractionEnabled = false
            isAccessibilityElement = false
        #else
            autoresizingMask = [.width, .height]
            setAccessibilityElement(false)
        #endif
        host.addSubview(self)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    #if canImport(UIKit)
        override func didMoveToWindow() {
            super.didMoveToWindow()
            onWindowChange()
        }
    #else
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            onWindowChange()
        }
    #endif
}
