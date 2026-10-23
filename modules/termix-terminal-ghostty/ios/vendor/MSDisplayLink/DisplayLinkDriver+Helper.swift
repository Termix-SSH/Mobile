//
//  DisplayLinkDriver+Helper.swift
//
//
//  Created by 秋星桥 on 2024/8/29.
//

import Foundation

class DisplayLinkDriverHelperBase: Identifiable {
    final let id: UUID = .init()

    private(set) var referenceHolder: [WeakBox] = []

    struct WeakBox { weak var object: DisplayLinkDriver? }

    final func delegate(_ object: DisplayLinkDriver) {
        assert(Thread.isMainThread)
        var shouldStartDisplayLink = false
        defer { if shouldStartDisplayLink { startDisplayLink() } }

        referenceHolder = referenceHolder
            .filter { $0.object != nil }
            .filter { $0.object?.id != object.id }
            + [.init(object: object)]

        shouldStartDisplayLink = !referenceHolder.isEmpty
    }

    final func remove(_ object: DisplayLinkDriver) {
        assert(Thread.isMainThread)

        referenceHolder = referenceHolder.filter { $0.object?.id != object.id }
    }

    final func reclaimComputeResourceIfPossible() {
        assert(Thread.isMainThread)
        var shouldStop = false
        defer { if shouldStop { self.stopDisplayLink() } }
        referenceHolder = referenceHolder.filter { $0.object != nil }
        shouldStop = referenceHolder.isEmpty
    }

    final func dispatchUpdate(context: DisplayLinkCallbackContext) {
        defer { self.reclaimComputeResourceIfPossible() }

        for box in referenceHolder {
            box.object?.synchronize(context: context)
        }
    }

    func startDisplayLink() {
        fatalError("Subclasses need to implement the `startDisplayLink()` method.")
    }

    func stopDisplayLink() {
        fatalError("Subclasses need to implement the `stopDisplayLink()` method.")
    }
}
