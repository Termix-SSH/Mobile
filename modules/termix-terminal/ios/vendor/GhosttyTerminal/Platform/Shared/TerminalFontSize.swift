//
//  TerminalFontSize.swift
//  libghostty-spm
//

import Foundation

/// A surface's font size, kept on the Swift side because the C API cannot
/// report it: `font_size` exists only in the creation-time
/// `ghostty_surface_config_s`, and `ghostty_surface_size_s` carries grid,
/// pixel and cell sizes, never points. So this mirrors what Ghostty's
/// `Surface.zig` does with its own `font_size` and `font_size_adjusted`,
/// rule for rule, and is moved by every font-size action the wrapper hands
/// the surface (`TerminalFontSizeAction`) and by every config reload.
struct TerminalFontSize: Equatable {
    /// Ghostty's own bounds: increase and decrease clamp the result to
    /// these, and `set_font_size` clamps its argument.
    static let bounds: ClosedRange<Float> = 1 ... 255

    /// The size the surface renders at, in points.
    private(set) var points: Float
    /// The config's `font-size`: where `reset_font_size` goes, and what a
    /// config reload applies while `isAdjusted` is clear.
    private(set) var configured: Float
    /// Ghostty's `font_size_adjusted`. Set by increase, decrease and set,
    /// cleared by reset; while set, a config reload leaves the size alone.
    private(set) var isAdjusted: Bool

    /// A new surface: at `option` when the host gave one (applied through
    /// `set_font_size`, so it starts adjusted — see
    /// `TerminalController.holdFontSize`), else at the config's size.
    init(configured: Float, option: Float?) {
        self.configured = configured
        if let option, option > 0 {
            points = Self.clamp(option)
            isAdjusted = true
        } else {
            points = configured
            isAdjusted = false
        }
    }

    /// Ghostty's handling of the action, in `Surface.performBindingAction`.
    /// The step is clamped to 0…255 before it is applied, so a negative
    /// step changes nothing.
    mutating func apply(_ action: TerminalFontSizeAction) {
        switch action {
        case let .increase(step):
            points = min(points + Self.clampStep(step), Self.bounds.upperBound)
            isAdjusted = true
        case let .decrease(step):
            points = max(points - Self.clampStep(step), Self.bounds.lowerBound)
            isAdjusted = true
        case let .set(value):
            points = Self.clamp(value)
            isAdjusted = true
        case .reset:
            points = configured
            isAdjusted = false
        }
    }

    /// Ghostty's `Surface.updateConfig`: the new `font-size` becomes the
    /// reset target, and the size itself only while nothing adjusted it.
    mutating func reloadConfiguration(configured: Float) {
        self.configured = configured
        guard !isAdjusted else { return }
        points = Self.clamp(configured)
    }

    private static func clamp(_ value: Float) -> Float {
        min(max(value, bounds.lowerBound), bounds.upperBound)
    }

    private static func clampStep(_ step: Float) -> Float {
        min(max(step, 0), bounds.upperBound)
    }
}
