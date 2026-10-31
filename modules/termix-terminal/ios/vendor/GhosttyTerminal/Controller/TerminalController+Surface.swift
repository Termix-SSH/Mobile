//
//  TerminalController+Surface.swift
//  libghostty-spm
//

import Foundation
import GhosttyKit

extension TerminalController {
    /// Creates a new Ghostty surface with the given configuration.
    ///
    /// The `platformSetup` closure lets the caller fill in
    /// platform-specific fields (`platform_tag`, `platform`, `scale_factor`)
    /// on the raw surface config struct before the surface is created.
    func createSurface(
        bridge: TerminalCallbackBridge,
        configuration: TerminalSurfaceOptions,
        platformSetup: (inout ghostty_surface_config_s) -> Void,
    ) -> ghostty_surface_t? {
        guard let app else { return nil }

        var surfaceConfig = ghostty_surface_config_new()
        surfaceConfig.userdata = Unmanaged.passUnretained(bridge).toOpaque()
        surfaceConfig.context = configuration.context.ghosttyValue
        configureBackend(&surfaceConfig, from: configuration)

        if let fontSize = configuration.fontSize {
            surfaceConfig.font_size = fontSize
        }

        if let waitAfterCommand = configuration.waitAfterCommand {
            surfaceConfig.wait_after_command = waitAfterCommand
        }

        // Like `working_directory` below, the pointers only need to outlive
        // `ghostty_surface_new`, which copies the values during surface init.
        return withEnvVarEntries(configuration.envVars) { entries, count in
            surfaceConfig.env_vars = entries
            surfaceConfig.env_var_count = count
            return finalizeSurface(
                app: app,
                bridge: bridge,
                configuration: configuration,
                config: &surfaceConfig,
                workingDirectory: configuration.workingDirectory,
                command: configuration.command,
                platformSetup: platformSetup,
            )
        }
    }

    /// Runs `body` with a C representation of `envVars` (`ghostty_env_var_s`
    /// entries) that stays valid for the duration of the call.
    private func withEnvVarEntries<T>(
        _ envVars: [String: String],
        _ body: (UnsafeMutablePointer<ghostty_env_var_s>?, Int) -> T,
    ) -> T {
        guard !envVars.isEmpty else { return body(nil, 0) }
        let strings: [(key: UnsafeMutablePointer<CChar>, value: UnsafeMutablePointer<CChar>)] =
            envVars.map { (strdup($0.key), strdup($0.value)) }
        defer {
            for entry in strings {
                free(entry.key)
                free(entry.value)
            }
        }
        var entries = strings.map { ghostty_env_var_s(key: $0.key, value: $0.value) }
        return entries.withUnsafeMutableBufferPointer { buffer in
            body(buffer.baseAddress, buffer.count)
        }
    }

    func retain(_ bridge: TerminalCallbackBridge) {
        retainedBridges.append(bridge)
    }

    func remove(_ bridge: TerminalCallbackBridge) {
        retainedBridges.removeAll { $0 === bridge }
    }

    var retainedBridgeCount: Int {
        retainedBridges.count
    }

    private func configureBackend(
        _ config: inout ghostty_surface_config_s,
        from options: TerminalSurfaceOptions,
    ) {
        guard case let .inMemory(session) = options.backend else {
            config.backend = GHOSTTY_SURFACE_IO_BACKEND_EXEC
            return
        }

        config.backend = GHOSTTY_SURFACE_IO_BACKEND_HOST_MANAGED
        config.receive_userdata = Unmanaged.passUnretained(session).toOpaque()
        config.receive_buffer = InMemoryTerminalSession.receiveBufferCallback
        config.receive_resize = InMemoryTerminalSession.receiveResizeCallback
    }

    private func finalizeSurface(
        app: ghostty_app_t,
        bridge: TerminalCallbackBridge,
        configuration: TerminalSurfaceOptions,
        config: inout ghostty_surface_config_s,
        workingDirectory: String?,
        command: String?,
        platformSetup: (inout ghostty_surface_config_s) -> Void,
    ) -> ghostty_surface_t? {
        guard let workingDirectory else {
            return finalizeCommand(
                app: app,
                bridge: bridge,
                configuration: configuration,
                config: &config,
                command: command,
                platformSetup: platformSetup,
            )
        }

        return workingDirectory.withCString { ptr in
            config.working_directory = ptr
            return finalizeCommand(
                app: app,
                bridge: bridge,
                configuration: configuration,
                config: &config,
                command: command,
                platformSetup: platformSetup,
            )
        }
    }

    private func finalizeCommand(
        app: ghostty_app_t,
        bridge: TerminalCallbackBridge,
        configuration: TerminalSurfaceOptions,
        config: inout ghostty_surface_config_s,
        command: String?,
        platformSetup: (inout ghostty_surface_config_s) -> Void,
    ) -> ghostty_surface_t? {
        guard let command else {
            return buildSurface(
                app: app,
                bridge: bridge,
                configuration: configuration,
                config: &config,
                platformSetup: platformSetup,
            )
        }

        return command.withCString { ptr in
            config.command = ptr
            return buildSurface(
                app: app,
                bridge: bridge,
                configuration: configuration,
                config: &config,
                platformSetup: platformSetup,
            )
        }
    }

    private func buildSurface(
        app: ghostty_app_t,
        bridge: TerminalCallbackBridge,
        configuration: TerminalSurfaceOptions,
        config: inout ghostty_surface_config_s,
        platformSetup: (inout ghostty_surface_config_s) -> Void,
    ) -> ghostty_surface_t? {
        platformSetup(&config)
        guard let surface = ghostty_surface_new(app, &config) else {
            return nil
        }

        retain(bridge)

        if case let .inMemory(session) = configuration.backend {
            session.setSurface(surface)
        }

        holdFontSize(of: surface, from: configuration)

        return surface
    }

    /// `font_size` above sizes the new surface but leaves Ghostty's
    /// "manually adjusted" flag clear, and a surface with that flag clear
    /// snaps back to the config's `font-size` on every config reload
    /// (`Surface.updateConfig`) — a theme change, or the light/dark switch
    /// of a theme with two variants, quietly undid the size the host asked
    /// for. `set_font_size` is the same size through the binding, which
    /// sets the flag, so the option holds the way a zoom does.
    /// `reset_font_size` (Cmd+0) still returns to the config's size: Ghostty
    /// resets to the config, never to the creation option.
    private func holdFontSize(
        of surface: ghostty_surface_t,
        from configuration: TerminalSurfaceOptions,
    ) {
        // 0 is how the C config spells "unset"; the binding would clamp it
        // to 1 point instead.
        guard let fontSize = configuration.fontSize, fontSize > 0 else { return }
        let action = "set_font_size:\(fontSize)"
        _ = action.withCString { cStr in
            ghostty_surface_binding_action(surface, cStr, UInt(action.utf8.count))
        }
    }
}
