//
//  DisplayLink.swift
//  MSDisplayLink
//
//  Created by 秋星桥 on 2024/8/13.
//

@preconcurrency import Combine
import Foundation

public protocol DisplayLinkDelegate: AnyObject {
    func synchronization(context: DisplayLinkCallbackContext)
}

public class DisplayLink: @unchecked Sendable {
    private weak var delegatingObject: DisplayLinkDelegate?

    private var driver: DisplayLinkDriver?
    private var driverSubscription: Set<AnyCancellable> = .init()

    public init() {
        let driver = DisplayLinkDriver()
        driver.synchronizationPublisher
            .sink { [weak self] output in self?.delegatingObject?.synchronization(context: output) }
            .store(in: &driverSubscription)
        self.driver = driver
    }

    deinit { teardown() }

    func teardown() {
        driverSubscription.forEach { $0.cancel() }
        driverSubscription.removeAll()
        driver = nil
    }

    public func delegatingObject(_ object: DisplayLinkDelegate?) {
        delegatingObject = object
    }
}
