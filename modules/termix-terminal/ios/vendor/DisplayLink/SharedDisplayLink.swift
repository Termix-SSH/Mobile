//
//  SharedDisplayLink.swift
//  DisplayLink
//

import Foundation

/// One system link per display and frame rate, shared by every
/// ``DisplayLink`` that asks for that rate on that display. Its system link
/// exists exactly while it has subscribers and the app is not suspended.
@MainActor
final class SharedDisplayLink {
    struct Key: Hashable {
        let display: Display
        let frameRateRange: DisplayLinkFrameRateRange
    }

    private(set) static var links: [Key: SharedDisplayLink] = [:]
    private static let systemEventsObserved: Void = observeSystemEvents()

    static var isSuspended = false {
        didSet { links.values.forEach { $0.updatePlatformLink() } }
    }

    static func link(for key: Key) -> SharedDisplayLink {
        _ = systemEventsObserved
        if let link = links[key] {
            return link
        }
        let link = SharedDisplayLink(key: key)
        links[key] = link
        return link
    }

    /// Something may have moved a window to another display, or a display that
    /// could not be linked to may be usable now.
    static func displaysDidChange() {
        links.values.forEach { $0.updatePlatformLink() }
        DisplayLink.rebindAll()
    }

    private struct Subscriber {
        let id: ObjectIdentifier
        let order: UInt64
        weak var link: DisplayLink?
    }

    let key: Key
    /// Sorted by ``DisplayLink/order``: links created first are called first,
    /// however often they pause, resume or rebind in between.
    private var subscribers: [Subscriber] = []
    private var platformLink: PlatformLink?

    private init(key: Key) {
        self.key = key
    }

    var isRunning: Bool {
        platformLink != nil
    }

    var subscriberCount: Int {
        subscribers.count
    }

    func add(_ link: DisplayLink) {
        let index = subscribers.firstIndex { $0.order > link.order } ?? subscribers.endIndex
        subscribers.insert(Subscriber(id: ObjectIdentifier(link), order: link.order, link: link), at: index)
        updatePlatformLink()
    }

    /// Takes the identifier rather than the link: this runs from the link's
    /// deinit, where weak references to it already read nil.
    func remove(_ id: ObjectIdentifier) {
        subscribers.removeAll { $0.id == id }
        if subscribers.isEmpty {
            Self.links[key] = nil
        }
        updatePlatformLink()
    }

    private func updatePlatformLink() {
        guard !subscribers.isEmpty, !Self.isSuspended else {
            platformLink = nil
            return
        }
        guard platformLink == nil else { return }
        platformLink = PlatformLink(display: key.display, frameRateRange: key.frameRateRange) { [weak self] frame in
            self?.deliver(frame)
        }
    }

    /// Not every display change is announced: an iPad scene moved to an
    /// external display posts nothing a link can observe. Rather than resolve
    /// every link on every frame, recheck all bindings once a second.
    private static var lastRebind: TimeInterval = 0

    private func deliver(_ frame: DisplayLinkFrame) {
        if frame.timestamp - Self.lastRebind >= 1 {
            Self.lastRebind = frame.timestamp
            DisplayLink.rebindAll()
        }
        // Iterates a snapshot: a subscriber may leave or join from its own callback.
        for subscriber in subscribers {
            subscriber.link?.deliver(frame, from: self)
        }
    }
}
