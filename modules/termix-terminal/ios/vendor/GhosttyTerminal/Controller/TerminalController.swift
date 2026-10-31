//
//  TerminalController.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/16.
//

import Foundation
import GhosttyKit

#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

/// Manages the Ghostty app lifecycle, configuration loading, and surface
/// creation.
///
/// `TerminalController` is the **single source of truth** for terminal
/// configuration, including the base config, per-session overrides, theme
/// colors, and the active color scheme. When any of these change the
/// controller re-resolves the effective config and pushes it to ghostty.
@MainActor
public final class TerminalController {
    struct PreparedConfig {
        let rawValue: ghostty_config_t
        let managedConfigURL: URL?
        let renderedContents: String
    }

    struct ConfigurationIssue: Error, CustomStringConvertible {
        let description: String

        init(_ description: String) {
            self.description = description
        }
    }

    public enum ConfigSource: Sendable, Hashable {
        case none
        case file(String)
        case generated(String)
    }

    public static let shared = TerminalController()

    static let defaultRenderedConfig = TerminalConfiguration.default.rendered
    private static var runtimeInitialized = false

    nonisolated(unsafe) var app: ghostty_app_t?
    nonisolated(unsafe) var config: ghostty_config_t?
    var retainedBridges: [TerminalCallbackBridge] = []
    var configSource: ConfigSource
    var managedConfigURL: URL?
    var renderedConfigContents: String = TerminalController.defaultRenderedConfig

    public internal(set) var lastConfigurationIssue: String?
    /// One surface's interest in a wakeup. Every surface shares this
    /// controller, so a single handler is not enough.
    struct WakeupObserver {
        let shouldProcess: () -> Bool
        let onWakeup: () -> Void
    }

    private var wakeupObservers: [ObjectIdentifier: WakeupObserver] = [:]
    nonisolated let wakeupGate = TerminalWakeupGate()

    func addWakeupObserver(
        _ key: ObjectIdentifier,
        shouldProcess: @escaping () -> Bool,
        onWakeup: @escaping () -> Void,
    ) {
        wakeupObservers[key] = WakeupObserver(shouldProcess: shouldProcess, onWakeup: onWakeup)
    }

    func removeWakeupObserver(_ key: ObjectIdentifier) {
        wakeupObservers.removeValue(forKey: key)
    }

    /// One state's interest in a new effective config. The config changes
    /// through the controller as well as through a state — a platform view
    /// whose delegate is not the state switches the color scheme here — and
    /// several states can share one controller.
    private(set) var configObservers: [ObjectIdentifier: () -> Void] = [:]

    func addConfigObserver(_ key: ObjectIdentifier, onChange: @escaping () -> Void) {
        configObservers[key] = onChange
    }

    func removeConfigObserver(_ key: ObjectIdentifier) {
        configObservers.removeValue(forKey: key)
    }

    // MARK: - Config Resolution State

    /// The base config before theme/colorScheme are applied: what actually
    /// loaded, so `.none` after init fell back from a rejected file.
    var baseConfigSource: ConfigSource = .none
    var baseConfigTemplate: String = ""

    /// Per-session configuration overrides (e.g. font size changes).
    public private(set) var terminalConfiguration: TerminalConfiguration

    /// Color theme (light + dark variants).
    public private(set) var theme: TerminalTheme

    /// The currently active color scheme.
    public private(set) var effectiveColorScheme: TerminalColorScheme = .light

    /// The effective config's `background`.
    public internal(set) var backgroundColor = TerminalColor(red: 0x28, green: 0x2C, blue: 0x34)

    /// The effective config's `font-size`: what a surface without its own
    /// `TerminalSurfaceOptions.fontSize` starts at, and what Cmd+0
    /// (`reset_font_size`) returns every surface to. Read back from Ghostty
    /// rather than worked out here, because three layers can set it — a
    /// config file, `TerminalConfiguration.default` (10 points on iOS and
    /// Mac Catalyst, 14 elsewhere), and Ghostty's own per-OS default when
    /// neither does. No surface exists before the first config loads.
    var configuredFontSize: Float = 0

    // MARK: - Public Accessors

    public var currentConfigSource: ConfigSource {
        configSource
    }

    public var renderedConfig: String {
        renderedConfigContents
    }

    // MARK: - Initializers

    /// Creates a controller with the default terminal configuration.
    public convenience init() {
        self.init(configuration: .default)
    }

    /// Creates a controller with a fully custom configuration.
    public convenience init(
        configuration: TerminalConfiguration,
        theme: TerminalTheme = .default,
    ) {
        self.init(
            configSource: .generated(configuration.rendered),
            theme: theme,
        )
    }

    /// Creates a controller by composing additional commands on top of
    /// the default configuration.
    ///
    ///     TerminalController {
    ///         $0.withBackgroundOpacity(0)
    ///         $0.withCustom("keybind", "super+k=text:\\x0c")
    ///     }
    public convenience init(
        theme: TerminalTheme = .default,
        configure: (inout TerminalConfiguration.Builder) -> Void,
    ) {
        self.init(
            configuration: TerminalConfiguration(
                startingFrom: .default,
                configure: configure,
            ),
            theme: theme,
        )
    }

    /// Creates a controller that loads its configuration from a file.
    public convenience init(
        configFilePath: String?,
        theme: TerminalTheme = .default,
    ) {
        guard let configFilePath else {
            self.init(configSource: .none, theme: theme)
            return
        }
        self.init(configSource: .file(configFilePath), theme: theme)
    }

    /// Low-level initialiser for full control over the config source.
    public init(
        configSource: ConfigSource = .none,
        theme: TerminalTheme = .default,
        terminalConfiguration: TerminalConfiguration = .init(),
    ) {
        Self.initializeRuntimeIfNeeded()

        self.theme = theme
        self.terminalConfiguration = terminalConfiguration
        self.configSource = configSource

        // Load the base config (without theme) so ghostty validates it.
        applyInitialConfig(source: configSource)
        baseConfigSource = self.configSource
        baseConfigTemplate = renderedConfigContents
        let baseIssue = lastConfigurationIssue

        // Now apply theme on top and push to ghostty.
        reconfigure()
        // The theme pass loading does not make a rejected base config
        // load; the fallback is what a host reads here after init.
        if let baseIssue {
            lastConfigurationIssue = baseIssue
        }
        createApp()
    }

    // MARK: - Color Scheme

    /// Updates the active color scheme and reconfigures the terminal.
    ///
    /// Called by platform views when the OS appearance changes. This is
    /// the only method views need to call — the controller handles all
    /// config resolution internally.
    public func setColorScheme(_ scheme: TerminalColorScheme) {
        setColorScheme(scheme, willChange: nil)
    }

    @discardableResult
    func setColorScheme(
        _ scheme: TerminalColorScheme,
        willChange: (() -> Void)?,
    ) -> Bool {
        let previous = effectiveColorScheme
        guard scheme != previous else {
            if let app {
                ghostty_app_set_color_scheme(app, scheme.ghosttyValue)
            }
            return false
        }

        let resolved = resolveEffectiveConfig(colorScheme: scheme)
        guard applyResolvedConfig(
            resolved,
            willChange: willChange,
            applyState: { effectiveColorScheme = scheme },
        ) else {
            return false
        }

        if let app {
            ghostty_app_set_color_scheme(app, scheme.ghosttyValue)
        }

        return true
    }

    // MARK: - Theme

    /// Updates the theme and reconfigures the terminal.
    @discardableResult
    public func setTheme(_ theme: TerminalTheme) -> Bool {
        setTheme(theme, willChange: nil)
    }

    @discardableResult
    func setTheme(
        _ theme: TerminalTheme,
        willChange: (() -> Void)?,
    ) -> Bool {
        guard theme != self.theme else { return false }
        let resolved = resolveEffectiveConfig(theme: theme)
        return applyResolvedConfig(
            resolved,
            willChange: willChange,
            applyState: { self.theme = theme },
        )
    }

    // MARK: - Terminal Configuration

    /// Updates per-session configuration overrides and reconfigures.
    @discardableResult
    public func setTerminalConfiguration(
        _ terminalConfiguration: TerminalConfiguration,
    ) -> Bool {
        setTerminalConfiguration(terminalConfiguration, willChange: nil)
    }

    @discardableResult
    func setTerminalConfiguration(
        _ terminalConfiguration: TerminalConfiguration,
        willChange: (() -> Void)?,
    ) -> Bool {
        guard terminalConfiguration != self.terminalConfiguration else { return false }
        let resolved = resolveEffectiveConfig(terminalConfiguration: terminalConfiguration)
        return applyResolvedConfig(
            resolved,
            willChange: willChange,
            applyState: { self.terminalConfiguration = terminalConfiguration },
        )
    }

    // MARK: - Config Resolution

    @discardableResult
    func reconfigure() -> Bool {
        applyResolvedConfig(resolveEffectiveConfig(), willChange: nil)
    }

    private func resolveEffectiveConfig() -> (
        source: ConfigSource, contents: String,
    ) {
        resolveEffectiveConfig(
            theme: theme,
            terminalConfiguration: terminalConfiguration,
            colorScheme: effectiveColorScheme,
        )
    }

    private func resolveEffectiveConfig(
        theme: TerminalTheme? = nil,
        terminalConfiguration: TerminalConfiguration? = nil,
        colorScheme: TerminalColorScheme? = nil,
    ) -> (source: ConfigSource, contents: String) {
        let nextTheme = theme ?? self.theme
        let nextTerminalConfiguration = terminalConfiguration ?? self.terminalConfiguration
        let nextColorScheme = colorScheme ?? effectiveColorScheme
        let themeConfig = nextTheme.configuration(for: nextColorScheme)
        if nextTerminalConfiguration.isEmpty, themeConfig.isEmpty {
            return (baseConfigSource, baseConfigTemplate)
        }

        let contents = GhosttyConfigRenderer.render(
            baseContents: baseConfigTemplate,
            configuration: nextTerminalConfiguration,
            theme: themeConfig,
        )
        return (.generated(contents), contents)
    }

    // MARK: - Tick

    public func tick() {
        guard let app else { return }
        ghostty_app_tick(app)
    }

    func handleWakeup() {
        let observers = Array(wakeupObservers.values)
        // One detached surface must not stop the tick for the others.
        guard observers.isEmpty || observers.contains(where: { $0.shouldProcess() }) else {
            TerminalDebugLog.log(.lifecycle, "wakeup suspended")
            return
        }

        tick()
        for observer in observers {
            observer.onWakeup()
        }
    }

    private static func initializeRuntimeIfNeeded() {
        guard !runtimeInitialized else { return }
        runtimeInitialized = true
        GhosttyRuntimeResources.configureEnvironment()
        TerminalLocaleEnvironment.configureEnvironment()
        ghostty_init(0, nil)
    }

    deinit {
        if let app {
            ghostty_app_free(app)
        }
        if let config {
            ghostty_config_free(config)
        }
        if let managedConfigURL {
            try? FileManager.default.removeItem(at: managedConfigURL)
        }
    }
}
