//
//  DisplayLink+SwiftUI.swift
//  DisplayLink
//
//  Created by 秋星桥 on 2024/8/14.
//

import SwiftUI

public extension View {
    /// Calls `action` once per refresh of the display showing this view, on
    /// the main thread, while the view is in a window and `isPaused` is false.
    func onDisplayLink(
        preferredFrameRateRange: DisplayLinkFrameRateRange = .default,
        isPaused: Bool = false,
        perform action: @escaping @MainActor (DisplayLinkFrame) -> Void,
    ) -> some View {
        background(DisplayLinkHost(preferredFrameRateRange: preferredFrameRateRange, isPaused: isPaused, action: action))
    }
}

/// An empty platform view behind the content: the link binds to it, so it
/// follows whichever window and display the content is shown in.
@MainActor
private struct DisplayLinkHost {
    let preferredFrameRateRange: DisplayLinkFrameRateRange
    let isPaused: Bool
    let action: @MainActor (DisplayLinkFrame) -> Void

    @MainActor
    final class Coordinator: DisplayLinkDelegate {
        var link: DisplayLink?
        var action: @MainActor (DisplayLinkFrame) -> Void = { _ in }

        func displayLink(_: DisplayLink, didUpdate frame: DisplayLinkFrame) {
            action(frame)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    private func makeView(coordinator: Coordinator) -> PlatformView {
        let view = PlatformView()
        let link = DisplayLink(context: .view(view), preferredFrameRateRange: preferredFrameRateRange)
        link.delegate = coordinator
        coordinator.link = link
        update(coordinator: coordinator)
        return view
    }

    private func update(coordinator: Coordinator) {
        coordinator.action = action
        coordinator.link?.preferredFrameRateRange = preferredFrameRateRange
        coordinator.link?.isPaused = isPaused
    }
}

#if canImport(UIKit)
    extension DisplayLinkHost: UIViewRepresentable {
        func makeUIView(context: Context) -> UIView {
            makeView(coordinator: context.coordinator)
        }

        func updateUIView(_: UIView, context: Context) {
            update(coordinator: context.coordinator)
        }
    }
#else
    extension DisplayLinkHost: NSViewRepresentable {
        func makeNSView(context: Context) -> NSView {
            makeView(coordinator: context.coordinator)
        }

        func updateNSView(_: NSView, context: Context) {
            update(coordinator: context.coordinator)
        }
    }
#endif
