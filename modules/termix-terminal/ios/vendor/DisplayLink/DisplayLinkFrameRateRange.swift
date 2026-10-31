//
//  DisplayLinkFrameRateRange.swift
//  DisplayLink
//
//  Created by 秋星桥 on 2026/8/11.
//

import Foundation

/// The frame rate a `DisplayLink` asks the display for, expressed in frames
/// per second. UIKit platforms hand it to `CADisplayLink.preferredFrameRateRange`
/// (iOS 15+). CVDisplayLink cannot be slowed, so on macOS frames are skipped
/// down to the preferred rate.
///
/// The library defaults to the full ProMotion range rather than the
/// system's 60 fps fallback — a display link exists to animate, and an
/// animation library that silently ticks at half the display's rate is how
/// 120 Hz scroll and 60 Hz animation end up mixed on one screen.
///
/// Note that a range is a request, not a guarantee: the system still clamps
/// it to what the hardware supports, and on iPhone the app must also declare
/// `CADisableMinimumFrameDurationOnPhone` in its Info.plist before any rate
/// above 60 is honored.
public struct DisplayLinkFrameRateRange: Sendable, Hashable {
    /// The slowest rate the caller can tolerate.
    public var minimum: Float
    /// The fastest rate worth ticking at.
    public var maximum: Float
    /// The rate the caller actually wants.
    public var preferred: Float

    public init(minimum: Float = 60, maximum: Float = 120, preferred: Float = 120) {
        self.minimum = minimum
        self.maximum = maximum
        self.preferred = preferred
    }

    /// Full ProMotion: 60 minimum, 120 preferred.
    public static let `default` = DisplayLinkFrameRateRange()

    /// The same request reshaped into one `CAFrameRateRange` accepts:
    /// all zero (system default), or `0 < minimum <= maximum` with a finite
    /// `preferred` that is either 0 (no preference) or inside the range.
    /// Core Animation raises an exception for anything else, and partial
    /// initializers such as `.init(maximum: 60)` would otherwise keep a
    /// preferred of 120. The maximum wins over the minimum: it is the cap the
    /// caller asked for.
    var normalized: DisplayLinkFrameRateRange {
        if minimum == 0, maximum == 0, preferred == 0 {
            return self
        }
        let maximum = maximum.isFinite && maximum > 0 ? maximum : Self.default.maximum
        let minimum = minimum.isFinite && minimum > 0 ? Swift.min(minimum, maximum) : Swift.min(1, maximum)
        let preferred = preferred.isFinite && preferred != 0
            ? Swift.min(Swift.max(preferred, minimum), maximum)
            : 0
        return DisplayLinkFrameRateRange(minimum: minimum, maximum: maximum, preferred: preferred)
    }
}
