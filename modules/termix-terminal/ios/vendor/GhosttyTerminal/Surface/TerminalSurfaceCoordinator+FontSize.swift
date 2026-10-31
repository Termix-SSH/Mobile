//
//  TerminalSurfaceCoordinator+FontSize.swift
//  libghostty-spm
//

import Foundation

/// Font-size tracking for both platform views. It lives in the coordinator,
/// not in a view, because everything it needs meets here: the rebuild that
/// starts a surface at a new size, the config reload that can move it, the
/// delegate that hears about it, and the surface whose font-size actions
/// report in through `TerminalSurface.onFontSizeAction`.
extension TerminalSurfaceCoordinator {
    /// A new surface starts at the option's size or the config's, whatever
    /// the old one had zoomed to. Called once per successful build.
    func startFontSizeTracking(on surface: TerminalSurface, controller: TerminalController) {
        surface.onFontSizeAction = { [weak self] action in
            self?.applyFontSizeAction(action)
        }
        updateFontSize(
            TerminalFontSize(
                configured: controller.configuredFontSize,
                option: configuration.fontSize,
            ),
        )
    }

    func applyFontSizeAction(_ action: TerminalFontSizeAction) {
        guard var next = fontSize else { return }
        next.apply(action)
        TerminalDebugLog.log(.actions, "font size action=\(action) points=\(next.points)")
        updateFontSize(next)
    }

    /// The controller pushed a new config and the surface took it
    /// (GHOSTTY_ACTION_CONFIG_CHANGE). The controller updates its own copy
    /// before the push, so `configuredFontSize` is already the new one.
    func reloadFontSizeConfiguration() {
        guard var next = fontSize, let controller else { return }
        next.reloadConfiguration(configured: controller.configuredFontSize)
        updateFontSize(next)
    }

    /// Stores the size and tells the delegate when the points moved: never
    /// for a step the clamp swallowed or a reload that left the size alone,
    /// always for a new surface (the size was nil while there was none).
    private func updateFontSize(_ next: TerminalFontSize) {
        let previous = fontSize?.points
        fontSize = next
        guard next.points != previous else { return }
        (delegate as? any TerminalSurfaceFontSizeDelegate)?
            .terminalDidChangeFontSize(next.points)
    }
}
