//
//  TerminalController+Config.swift
//  libghostty-spm
//

import Foundation
import GhosttyKit

extension TerminalController {
    /// Generated config files belong to the host app. Hosts may remove this
    /// directory before creating any controllers and when terminating, so a
    /// forced exit does not leave files behind indefinitely. Never clear it
    /// while controllers are in use. User-supplied config files live elsewhere.
    public static var managedConfigDirectory: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(
            Bundle.main.bundleIdentifier ?? ProcessInfo.processInfo.processName,
            isDirectory: true,
        )
    }

    @discardableResult
    public func updateConfigSource(_ source: ConfigSource) -> Bool {
        // No same-source short-circuit: a host re-giving `.file(path)` is
        // asking for the file to be read again.
        switch Self.prepareConfig(source: source) {
        case let .success(value):
            // The new source becomes the base, the same way init loads
            // it: applied bare, then theme and overrides on top.
            applyPreparedConfigToRuntime(value, source: source)
            baseConfigSource = source
            baseConfigTemplate = value.renderedContents
            return reconfigure()

        case let .failure(issue):
            lastConfigurationIssue = issue.description
            Self.reportConfigurationIssue(issue.description)
            return false
        }
    }

    func applyResolvedConfig(
        _ resolved: (source: ConfigSource, contents: String),
        willChange: (() -> Void)?,
        applyState: () -> Void = {},
    ) -> Bool {
        guard resolved.source != configSource else {
            // ObservableObject subscribers expect will-change semantics.
            willChange?()
            applyState()
            renderedConfigContents = resolved.contents
            return true
        }

        switch Self.prepareConfig(source: resolved.source) {
        case let .success(prepared):
            // Notify after validation succeeds, but before committed state
            // changes become visible through computed TerminalViewState APIs.
            willChange?()
            applyState()
            applyPreparedConfigToRuntime(prepared, source: resolved.source)
            return true

        case let .failure(issue):
            lastConfigurationIssue = issue.description
            Self.reportConfigurationIssue(issue.description)
            return false
        }
    }

    private func applyPreparedConfigToRuntime(_ prepared: PreparedConfig, source: ConfigSource) {
        let previousConfig = config
        let previousManagedConfigURL = managedConfigURL
        let nextConfig = prepared.rawValue

        // The controller takes the config first: each surface reports the
        // reload from inside ghostty_app_update_config (CONFIG_CHANGE, on
        // this thread), and the font-size tracking it triggers reads
        // `configuredFontSize` back from here.
        applyPreparedConfig(prepared, source: source)

        // Core's App.updateConfig hands the config to every surface the app
        // owns, so a per-surface ghostty_surface_update_config here would
        // apply it to each one a second time.
        if let app {
            ghostty_app_update_config(app, nextConfig)
        }

        if let previousConfig {
            ghostty_config_free(previousConfig)
        }

        if let previousManagedConfigURL, previousManagedConfigURL != managedConfigURL {
            try? FileManager.default.removeItem(at: previousManagedConfigURL)
        }
    }

    func applyInitialConfig(source: ConfigSource) {
        switch Self.prepareConfig(source: source) {
        case let .success(prepared):
            applyPreparedConfig(prepared, source: source)

        case let .failure(issue):
            lastConfigurationIssue = issue.description
            Self.reportConfigurationIssue(issue.description)

            guard source != .none else { return }
            guard case let .success(fallback) = Self.prepareConfig(source: ConfigSource.none) else {
                return
            }
            applyPreparedConfig(fallback, source: .none)
            // The fallback loading is not the requested source loading.
            lastConfigurationIssue = issue.description
        }
    }

    func createApp() {
        guard let cfg = config else { return }

        let userdata = Unmanaged.passUnretained(self).toOpaque()

        var runtimeConfig = ghostty_runtime_config_s()
        runtimeConfig.userdata = userdata
        runtimeConfig.supports_selection_clipboard = true
        runtimeConfig.wakeup_cb = terminalControllerWakeupCallback
        runtimeConfig.action_cb = terminalControllerActionCallback
        runtimeConfig.close_surface_cb = terminalControllerCloseSurfaceCallback
        runtimeConfig.write_clipboard_cb = terminalControllerWriteClipboardCallback
        runtimeConfig.read_clipboard_cb = terminalControllerReadClipboardCallback
        runtimeConfig.confirm_read_clipboard_cb = terminalControllerConfirmReadClipboardCallback

        app = ghostty_app_new(&runtimeConfig, cfg)
    }

    private static func prepareConfig(
        source: ConfigSource,
    ) -> Result<PreparedConfig, ConfigurationIssue> {
        let resolvedContents: String
        let configPath: String
        let managedConfigURL: URL?

        switch source {
        case .none:
            resolvedContents = defaultRenderedConfig
            switch writeManagedConfig(contents: resolvedContents) {
            case let .success(url):
                managedConfigURL = url
                configPath = url.path
            case let .failure(issue):
                return .failure(issue)
            }

        case let .generated(contents):
            resolvedContents = contents
            switch writeManagedConfig(contents: contents) {
            case let .success(url):
                managedConfigURL = url
                configPath = url.path
            case let .failure(issue):
                return .failure(issue)
            }

        case let .file(path):
            // ghostty_config_load_file requires an absolute path: it takes
            // dirname(path) as the base for relative includes, which is
            // null for a bare filename.
            let absolutePath = URL(fileURLWithPath: path).standardizedFileURL.path
            do {
                resolvedContents = try String(contentsOfFile: absolutePath, encoding: .utf8)
            } catch {
                return .failure(ConfigurationIssue("failed to load ghostty config template: \(error)"))
            }
            managedConfigURL = nil
            configPath = absolutePath
        }

        guard let rawValue = ghostty_config_new() else {
            if let managedConfigURL {
                try? FileManager.default.removeItem(at: managedConfigURL)
            }
            return .failure(ConfigurationIssue("ghostty_config_new returned nil"))
        }

        ghostty_config_load_file(rawValue, configPath)
        ghostty_config_finalize(rawValue)

        let diagnostics = configDiagnostics(from: rawValue)
        guard diagnostics.isEmpty else {
            ghostty_config_free(rawValue)
            if let managedConfigURL {
                try? FileManager.default.removeItem(at: managedConfigURL)
            }
            return .failure(
                ConfigurationIssue("ghostty config diagnostics: \(diagnostics.joined(separator: " | "))"),
            )
        }

        return .success(
            PreparedConfig(
                rawValue: rawValue,
                managedConfigURL: managedConfigURL,
                renderedContents: resolvedContents,
            ),
        )
    }

    private static func writeManagedConfig(contents: String) -> Result<URL, ConfigurationIssue> {
        let directory = managedConfigDirectory
        let url = directory
            .appendingPathComponent("ghostty-config-\(UUID().uuidString)")
            .appendingPathExtension("conf")

        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try contents.write(to: url, atomically: true, encoding: .utf8)
            return .success(url)
        } catch {
            return .failure(ConfigurationIssue("failed to write generated ghostty config: \(error)"))
        }
    }

    private static func configDiagnostics(from config: ghostty_config_t) -> [String] {
        let count = ghostty_config_diagnostics_count(config)
        guard count > 0 else { return [] }

        return (0 ..< count).compactMap { index in
            let diagnostic = ghostty_config_get_diagnostic(config, index)
            guard let message = diagnostic.message else { return nil }
            return String(cString: message)
        }
    }

    private static func reportConfigurationIssue(_ message: String) {
        NSLog("GhosttyTerminal configuration issue: %@", message)
    }

    private func applyPreparedConfig(_ prepared: PreparedConfig, source: ConfigSource) {
        config = prepared.rawValue
        managedConfigURL = prepared.managedConfigURL
        renderedConfigContents = prepared.renderedContents
        configSource = source
        lastConfigurationIssue = nil

        let key = "background"
        var background = ghostty_config_color_s()
        _ = ghostty_config_get(prepared.rawValue, &background, key, UInt(key.utf8.count))
        backgroundColor = TerminalColor(background)

        let fontSizeKey = "font-size"
        var fontSize: Float = 0
        if ghostty_config_get(prepared.rawValue, &fontSize, fontSizeKey, UInt(fontSizeKey.utf8.count)) {
            configuredFontSize = fontSize
        }

        for onChange in configObservers.values {
            onChange()
        }
    }
}
