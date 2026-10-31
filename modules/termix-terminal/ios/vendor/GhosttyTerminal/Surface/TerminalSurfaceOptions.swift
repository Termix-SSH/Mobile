//
//  TerminalSurfaceOptions.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/16.
//

import GhosttyKit

public struct TerminalSurfaceOptions: Sendable {
    public var backend: TerminalSessionBackend
    /// Points this surface starts at, in place of the config's `font-size`.
    /// It holds across config reloads (a theme or appearance change) the way
    /// a zoom does; `reset_font_size` (Cmd+0) returns to the config's size.
    /// Part of the surface's identity: changing it rebuilds the surface.
    public var fontSize: Float?
    public var workingDirectory: String?
    /// Extra environment variables set in the child process spawned for this
    /// surface (exec backend). Passed through `ghostty_surface_config_s.env_vars`;
    /// every process launched from the surface's shell inherits them, which lets
    /// embedding hosts tag a surface (e.g. `MYAPP_PANE=<uuid>`) and correlate
    /// externally observed processes back to it.
    public var envVars: [String: String]
    /// Overrides the command executed in the child process spawned for this
    /// surface (exec backend), taking the place of the user's default shell.
    /// Passed through `ghostty_surface_config_s.command`. When `nil`, the
    /// value already established by `ghostty_surface_config_new()` (e.g. the
    /// app-level config's command, if any) is left untouched.
    public var command: String?
    /// Controls whether the surface stays open after `command` exits instead
    /// of closing immediately. Passed through
    /// `ghostty_surface_config_s.wait_after_command`. When `nil`, the value
    /// already established by `ghostty_surface_config_new()` is left
    /// untouched.
    public var waitAfterCommand: Bool?
    public var context: TerminalSurfaceContext

    /// Coalescing window for host-driven resizes, in milliseconds. `0`
    /// (the default) sizes the surface synchronously on every metrics change,
    /// which is the behaviour with no coalescing at all.
    ///
    /// Set this when the content re-renders on every resize: a live drag posts
    /// sizes faster than a full-repaint TUI can settle, so the grid reflow
    /// runs permanently behind the layer bounds. Bounding the stream — leading
    /// edge for responsiveness, trailing edge so the final size always lands —
    /// gives such a client something to settle on. Content that redraws
    /// incrementally is better off at `0`; coalesced jumps read as blinking.
    public var resizeThrottleMilliseconds: Double

    public init(
        backend: TerminalSessionBackend = .exec,
        fontSize: Float? = nil,
        workingDirectory: String? = nil,
        envVars: [String: String] = [:],
        command: String? = nil,
        waitAfterCommand: Bool? = nil,
        context: TerminalSurfaceContext = .window,
        resizeThrottleMilliseconds: Double = 0,
    ) {
        self.backend = backend
        self.fontSize = fontSize
        self.workingDirectory = workingDirectory
        self.envVars = envVars
        self.command = command
        self.waitAfterCommand = waitAfterCommand
        self.context = context
        self.resizeThrottleMilliseconds = max(0, resizeThrottleMilliseconds)
    }

    /// `resizeThrottleMilliseconds` is deliberately absent: it is a delivery
    /// policy, not part of the surface's identity. Including it would tear down
    /// and rebuild a live surface — discarding its grid and scrollback — for a
    /// change that only affects how often the existing surface is resized.
    func isEquivalent(to other: TerminalSurfaceOptions) -> Bool {
        fontSize == other.fontSize
            && workingDirectory == other.workingDirectory
            && envVars == other.envVars
            && command == other.command
            && waitAfterCommand == other.waitAfterCommand
            && context == other.context
            && backend.isEquivalent(to: other.backend)
    }

    var inMemorySession: InMemoryTerminalSession? {
        guard case let .inMemory(session) = backend else { return nil }
        return session
    }
}
