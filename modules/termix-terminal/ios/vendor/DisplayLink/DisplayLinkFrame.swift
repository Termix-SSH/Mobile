//
//  DisplayLinkFrame.swift
//  DisplayLink
//
//  Created by 秋星桥 on 2025/1/6.
//

import Foundation

/// One refresh of the display a ``DisplayLink`` is bound to.
///
/// Both timestamps are in host time seconds, the clock `CACurrentMediaTime()`
/// reads.
public struct DisplayLinkFrame: Sendable, Equatable {
    /// When the frame on screen now was presented.
    public let timestamp: TimeInterval
    /// When the next frame will be presented: the deadline for work done for it.
    public let targetTimestamp: TimeInterval

    /// The time this frame stays on screen. Varies with the refresh rate the
    /// display settles on, so animate by elapsed time rather than frame count.
    public var duration: TimeInterval {
        targetTimestamp - timestamp
    }

    public init(timestamp: TimeInterval, targetTimestamp: TimeInterval) {
        self.timestamp = timestamp
        self.targetTimestamp = targetTimestamp
    }
}
