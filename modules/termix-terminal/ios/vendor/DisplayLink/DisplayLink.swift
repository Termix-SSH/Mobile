//
//  DisplayLink.swift
//  DisplayLink
//
//  Created by 秋星桥 on 2024/8/13.
//

import Foundation

/// Receives a ``DisplayLink``'s frames inside the display refresh, which is
/// where rendering work belongs: it must finish by
/// ``DisplayLinkFrame/targetTimestamp``.
@MainActor
public protocol DisplayLinkDelegate: AnyObject {
    func displayLink(_ displayLink: DisplayLink, didUpdate frame: DisplayLinkFrame)
}

/// Delivers one frame per refresh of the display its ``context`` resolves to,
/// on the main thread.
///
/// Links asking for the same frame rate on the same display share one system
/// link and are called in the order they were created. A link ticks while its
/// context resolves to a display, it is not paused, and the app is in the
/// foreground; otherwise it costs nothing.
@MainActor
public final class DisplayLink {
    /// Held weakly, so an owner can be its link's delegate.
    public weak var delegate: (any DisplayLinkDelegate)?

    public var context: DisplayLinkContext {
        didSet { contextDidChange() }
    }

    /// The frame rate this link asks the display for.
    public var preferredFrameRateRange: DisplayLinkFrameRateRange {
        didSet { rebind() }
    }

    public var isPaused = false {
        didSet { rebind() }
    }

    /// The display link this one receives frames from, nil while not ticking.
    private(set) var subscription: SharedDisplayLink?
    /// Creation order, which decides the order links on one system link are called in.
    let order: UInt64
    private var anchor: WindowAnchor?
    private var continuations: [UUID: AsyncStream<DisplayLinkFrame>.Continuation] = [:]

    public init(context: DisplayLinkContext = .main, preferredFrameRateRange: DisplayLinkFrameRateRange = .default) {
        self.context = context
        self.preferredFrameRateRange = preferredFrameRateRange
        Self.createdCount += 1
        order = Self.createdCount
        Self.instances[ObjectIdentifier(self)] = Instance(link: self)
        contextDidChange()
    }

    deinit {
        let id = ObjectIdentifier(self)
        MainActor.assumeIsolated {
            subscription?.remove(id)
            anchor?.removeFromSuperview()
            continuations.values.forEach { $0.finish() }
            Self.instances[id] = nil
        }
    }

    /// The same frames as the delegate, as an async sequence, for work that
    /// can run a moment after the refresh. Each access starts a new sequence.
    /// It buffers only the newest frame: a consumer that falls behind skips
    /// frames instead of queuing them.
    public var frames: AsyncStream<DisplayLinkFrame> {
        AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            let id = UUID()
            continuations[id] = continuation
            continuation.onTermination = { [weak self] _ in
                Task { @MainActor in self?.continuations[id] = nil }
            }
        }
    }

    private func contextDidChange() {
        anchor?.removeFromSuperview()
        anchor = context.view.map { WindowAnchor(attachingTo: $0) { [weak self] in self?.rebind() } }
        rebind()
    }

    /// Moves the subscription to the system link for the display the context
    /// resolves to now and the rate this link asks for.
    func rebind() {
        let target = isPaused ? nil : context.display.map {
            SharedDisplayLink.link(for: .init(display: $0, frameRateRange: preferredFrameRateRange.normalized))
        }
        guard target !== subscription else { return }
        subscription?.remove(ObjectIdentifier(self))
        subscription = target
        target?.add(self)
    }

    func deliver(_ frame: DisplayLinkFrame, from source: SharedDisplayLink) {
        // An earlier subscriber's callback can rebind this link mid-frame.
        guard subscription === source else { return }
        delegate?.displayLink(self, didUpdate: frame)
        continuations.values.forEach { $0.yield(frame) }
    }

    // MARK: - Every live link, for events that can change any link's display

    private struct Instance {
        weak var link: DisplayLink?
    }

    private static var instances: [ObjectIdentifier: Instance] = [:]
    private static var createdCount: UInt64 = 0

    static func rebindAll() {
        Array(instances.values).forEach { $0.link?.rebind() }
    }
}
