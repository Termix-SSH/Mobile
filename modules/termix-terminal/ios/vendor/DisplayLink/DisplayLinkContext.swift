//
//  DisplayLinkContext.swift
//  DisplayLink
//

#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

/// Where a ``DisplayLink`` takes its frames from.
///
/// Bind to the view you draw into: the link then ticks with whichever display
/// shows that view, follows it when its window moves to another display, and
/// stays quiet while the view is not in a window.
@MainActor
public struct DisplayLinkContext {
    private enum Source {
        case main
        case screen(Display)
        case view(WeakView)
    }

    private struct WeakView {
        weak var view: PlatformView?
    }

    private let source: Source

    /// The primary display.
    public static var main: DisplayLinkContext {
        .init(source: .main)
    }

    #if canImport(UIKit)
        /// The display showing `view`, held weakly.
        ///
        /// Adds one hidden subview to `view` to hear about window changes.
        /// Removing it stops the link from following the view until
        /// `context` is set again.
        public static func view(_ view: UIView) -> DisplayLinkContext {
            .init(source: .view(WeakView(view: view)))
        }

        #if !os(visionOS)
            /// A specific screen.
            public static func screen(_ screen: UIScreen) -> DisplayLinkContext {
                .init(source: .screen(screen))
            }
        #endif
    #elseif canImport(AppKit)
        /// The display showing `view`, held weakly.
        ///
        /// Adds one hidden subview to `view` to hear about window changes.
        /// Removing it stops the link from following the view until
        /// `context` is set again.
        public static func view(_ view: NSView) -> DisplayLinkContext {
            .init(source: .view(WeakView(view: view)))
        }

        /// A specific screen.
        public static func screen(_ screen: NSScreen) -> DisplayLinkContext {
            .init(source: .screen(Display(screen)))
        }
    #endif

    /// The view whose window decides the display, if bound to one.
    var view: PlatformView? {
        guard case let .view(box) = source else { return nil }
        return box.view
    }

    /// The display to take frames from now, or nil while there is none:
    /// the view is gone or not in a window, or the screen was disconnected.
    var display: Display? {
        switch source {
        case .main: Display.primary
        case let .screen(display): display.isConnected ? display : nil
        case let .view(box): box.view.flatMap(Display.showing)
        }
    }
}
