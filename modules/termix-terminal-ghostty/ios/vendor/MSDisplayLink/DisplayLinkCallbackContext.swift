//
//  DisplayLinkCallbackContext.swift
//  MSDisplayLink
//
//  Created by 秋星桥 on 2025/1/6.
//

import Foundation

public struct DisplayLinkCallbackContext: Sendable {
    /// The time interval between screen refresh updates.
    public let duration: TimeInterval
    /// The time interval that represents when the last frame displayed.
    public let timestamp: TimeInterval
    /// The time interval that represents when the next frame displays.
    public let targetTimestamp: TimeInterval

    public init(duration: TimeInterval, timestamp: TimeInterval, targetTimestamp: TimeInterval) {
        self.duration = duration
        self.timestamp = timestamp
        self.targetTimestamp = targetTimestamp
    }
}
