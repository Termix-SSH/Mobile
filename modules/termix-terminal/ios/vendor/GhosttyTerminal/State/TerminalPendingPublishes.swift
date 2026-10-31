//
//  TerminalPendingPublishes.swift
//  libghostty-spm
//

import Foundation

/// State changes waiting for the main queue's next turn, newest per property.
///
/// A program can retitle its window tens of thousands of times a second
/// (`printf '\e]2;%s\a'` in a loop). One main-queue block per title outran
/// SwiftUI's flush, so the queue — and the strings it held — grew without
/// bound and kept draining for minutes after the output stopped. Keyed slots
/// bound the work to one block per turn whatever the event rate: a later
/// change to the same property replaces the earlier one in place, so changes
/// to different properties still apply in the order they first arrived.
struct TerminalPendingPublishes {
    enum Key: Hashable {
        case colorScheme
        case title
        case surfaceSize
        case focus
        case bell
        case desktopNotification
        case workingDirectory
        case scrollbar
        case background
        case config
        case commandFinished
        case fontSize
    }

    typealias Apply = @MainActor (TerminalViewState) -> Void

    private var order: [Key] = []
    private var changes: [Key: Apply] = [:]
    /// Rings since the last flush; the bell slot adds them all at once.
    var bellRings = 0
    var isFlushScheduled = false

    mutating func set(_ key: Key, _ apply: @escaping Apply) {
        if changes.updateValue(apply, forKey: key) == nil {
            order.append(key)
        }
    }

    mutating func take() -> [Apply] {
        let taken = order.compactMap { changes[$0] }
        order.removeAll(keepingCapacity: true)
        changes.removeAll(keepingCapacity: true)
        return taken
    }

    mutating func takeBellRings() -> Int {
        defer { bellRings = 0 }
        return bellRings
    }
}
