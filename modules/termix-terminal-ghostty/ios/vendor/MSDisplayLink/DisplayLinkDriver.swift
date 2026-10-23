//
//  DisplayLinkDriver.swift
//  MSDisplayLink
//
//  Created by 秋星桥 on 2024/8/13.
//

@preconcurrency import Combine
import Foundation

class DisplayLinkDriver: Identifiable {
    let id: UUID = .init()

    typealias SynchornizationPublisher = PassthroughSubject<
        DisplayLinkCallbackContext,
        Never
    >
    let synchronizationPublisher: SynchornizationPublisher

    init() {
        synchronizationPublisher = .init()
        DisplayLinkDriverHelper.shared.delegate(self)
    }

    deinit {
        DisplayLinkDriverHelper.shared.remove(self)
    }

    func synchronize(context: DisplayLinkCallbackContext) {
        synchronizationPublisher.send(context)
    }
}
