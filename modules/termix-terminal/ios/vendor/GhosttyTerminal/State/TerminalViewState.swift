//
//  TerminalViewState.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/16.
//

import Combine
import Foundation
import GhosttyKit
import SwiftUI

@MainActor
public final class TerminalViewState: ObservableObject {
    @Published public internal(set) var title: String = ""
    @Published public internal(set) var surfaceSize: TerminalGridMetrics?
    @Published public internal(set) var isFocused: Bool = false

    @Published public internal(set) var bellCount: Int = 0
    @Published public internal(set) var lastBellAt: Date?

    @Published public internal(set) var lastDesktopNotificationTitle: String?
    @Published public internal(set) var lastDesktopNotificationBody: String?
    @Published public internal(set) var lastDesktopNotificationAt: Date?

    @Published public internal(set) var workingDirectory: String?

    @Published public internal(set) var lastCommandExitCode: Int?
    @Published public internal(set) var lastCommandDurationNanos: UInt64?

    /// Latest scrollbar geometry reported by the terminal (nil until the first
    /// update). Drives a host-drawn scrollbar.
    @Published public internal(set) var scrollbar: TerminalScrollbar?

    /// The attached surface's font size in points (nil until a surface is
    /// built): a pinch, Cmd+=/-/0, a font-size binding action or a config
    /// reload moves it. To open every new terminal at the size last zoomed
    /// to, hand it to the next surface's ``TerminalSurfaceOptions/fontSize``
    /// — not to this state's own `configuration`, which would rebuild the
    /// surface it is showing.
    @Published public internal(set) var fontSize: Float?

    /// The effective config's `background`, or the color a program set with
    /// OSC 11 while the surface lives.
    @Published public internal(set) var backgroundColor: TerminalColor
    var programBackgroundColor: TerminalColor?

    public internal(set) weak var surface: TerminalSurface?

    /// The platform view currently presenting this state, set by the SwiftUI
    /// representable. Weak: the state outlives detached views.
    weak var attachedView: TerminalView?

    /// The platform view currently presenting this state, for host work that
    /// needs the real view — a rendered ``TerminalView/snapshotImage()``,
    /// coordinate math. `nil` while no view presents this state; weak like
    /// `attachedView`, because the state outlives detached views.
    public var attachedPlatformView: TerminalView? {
        attachedView
    }

    /// Factory for the platform view the SwiftUI representable creates.
    /// Hosts that need their own view behavior — an interaction lock,
    /// custom hit testing — return a `TerminalView` subclass here; `nil`
    /// (the default) instantiates the base class. Read once, when the
    /// surface view is made: set it before the surface first appears.
    public var makePlatformView: (@MainActor () -> TerminalView)?
    private var pendingFocusRequest = false
    var pendingPublishes = TerminalPendingPublishes()

    /// Whether the attached surface should keep drawing. Hosts that keep
    /// several surfaces mounted at once (tabs hidden behind `opacity(0)`)
    /// set this false on the hidden ones: the surface keeps its grid,
    /// scrollback, and session — only rendering stops and the display link
    /// is released, instead of every mounted tab drawing frames nobody
    /// sees. Defaults to true.
    @Published public var isSurfaceVisible: Bool = true

    @Published public var configuration: TerminalSurfaceOptions = .init()
    public var onClose: ((Bool) -> Void)?
    @Published public internal(set) var controller: TerminalController

    #if canImport(UIKit)
        #if !targetEnvironment(macCatalyst)
            /// Items of the software keyboard's input accessory bar, in order.
            /// `nil` shows `TerminalInputAccessoryItem.defaultItems`; an empty
            /// array hides the bar. Applied to the platform view by the SwiftUI
            /// representable.
            @Published public var inputAccessoryItems: [TerminalInputAccessoryItem]?
        #endif
    #endif

    /// Host hook for clipboard decisions ghostty will not make alone: a
    /// program reading the clipboard through OSC 52 (`clipboard-read = ask`,
    /// the default), writing it when `clipboard-write = ask`, or a paste
    /// that paste protection flagged as unsafe. The host presents the
    /// request and answers it with ``TerminalClipboardConfirmationRequest/respond(allow:)``.
    /// While this is `nil`, a program's read or write is denied silently and
    /// a paste the user started is allowed; a host that wants programs to
    /// read the clipboard, or wants a say on unsafe pastes, sets it.
    public var onClipboardConfirmationRequest: ((TerminalClipboardConfirmationRequest) -> Void)?

    /// Hands keyboard focus to the attached terminal view, imperatively.
    ///
    /// The SwiftUI `terminalFocused` bridge is best-effort: with no native
    /// focusable view anchoring the `FocusState`, SwiftUI's focus system can
    /// reset the state to nil before the bridge acts on it, leaving the
    /// previously focused surface holding first responder — and eating every
    /// hardware key. Hosts that must move focus deterministically (switching
    /// tabs, dismissing a cover) call this; a request that lands before the
    /// view is in a window replays once it attaches.
    public func requestFocus() {
        pendingFocusRequest = true
        // Hop the runloop: hosts call this from SwiftUI `onChange`, and the
        // first-responder dance writes focus state that must not mutate
        // SwiftUI state mid-update.
        DispatchQueue.main.async { [weak self] in
            self?.replayPendingFocusIfNeeded()
        }
    }

    func replayPendingFocusIfNeeded() {
        guard pendingFocusRequest else { return }
        guard let view = attachedView, view.acquireProgrammaticFocus() else {
            return
        }
        pendingFocusRequest = false
    }

    /// Pastes text into the attached surface. This is the text path: a
    /// program that enabled bracketed paste receives it framed as a paste,
    /// so a `\r` in it lands in the shell's edit line instead of running
    /// it. Keystrokes — Enter, Tab, Ctrl+C — go through ``sendKey(_:)``.
    @discardableResult
    public func paste(text: String) -> Bool {
        guard let surface else {
            TerminalDebugLog.log(.input, "view state paste ignored: missing surface")
            return false
        }
        return surface.paste(text: text)
    }

    /// Presses and releases a key on the attached surface, as if typed on a
    /// hardware keyboard — see ``TerminalSurface/sendKey(_:)``.
    @discardableResult
    public func sendKey(_ press: TerminalKeyPress) -> Bool {
        guard let surface else {
            TerminalDebugLog.log(.input, "view state key ignored: missing surface")
            return false
        }
        return surface.sendKey(press)
    }

    /// ``sendKey(_:)`` for a key and its modifiers: `sendKey(.enter)`,
    /// `sendKey(.c, modifiers: .ctrl)`.
    @discardableResult
    public func sendKey(_ key: TerminalKey, modifiers: TerminalInputModifiers = []) -> Bool {
        sendKey(TerminalKeyPress(key, modifiers: modifiers))
    }

    /// Invoke a named Ghostty binding action on the attached surface.
    @discardableResult
    public func performBindingAction(_ action: String) -> Bool {
        surface?.performBindingAction(action) ?? false
    }

    /// Jump the viewport by a number of shell prompts.
    ///
    /// Negative offsets move toward older prompts and positive offsets move
    /// toward newer prompts. Prompt navigation requires shell integration.
    @discardableResult
    public func jumpToPrompt(by offset: Int16) -> Bool {
        surface?.jumpToPrompt(by: offset) ?? false
    }

    /// Reveal an absolute scrollback row, where zero is the first row.
    @discardableResult
    public func scrollToRow(_ row: UInt) -> Bool {
        surface?.scrollToRow(row) ?? false
    }

    /// Whether the application currently owns the mouse (DEC 1000/1002/1003).
    public var isMouseCaptured: Bool {
        surface?.isMouseCaptured ?? false
    }

    /// Where the selection lies on screen, nil when there is none or none
    /// of it is in view. See ``TerminalSurface/selectionRegion()``; the
    /// views add the point-to-cell test (`selectionContains(_:)`).
    public var selectionRegion: TerminalSelectionRegion? {
        surface?.selectionRegion()
    }

    public func sendMousePos(
        x: Double,
        y: Double,
        modifiers: TerminalInputModifiers = [],
    ) {
        surface?.sendMousePos(x: x, y: y, modifiers: modifiers)
    }

    @discardableResult
    public func sendMouseButton(
        state: ghostty_input_mouse_state_e,
        button: ghostty_input_mouse_button_e,
        modifiers: TerminalInputModifiers = [],
    ) -> Bool {
        surface?.sendMouseButton(
            state: state,
            button: button,
            modifiers: modifiers,
        ) ?? false
    }

    public func sendMouseScroll(
        x: Double,
        y: Double,
        mods: TerminalScrollModifiers = TerminalScrollModifiers(precision: true),
    ) {
        surface?.sendMouseScroll(x: x, y: y, mods: mods)
    }

    public convenience init() {
        self.init(configSource: .none)
    }

    public convenience init(configFilePath: String?) {
        if let configFilePath {
            self.init(configSource: .file(configFilePath))
        } else {
            self.init(configSource: .none)
        }
    }

    public convenience init(
        configSource: TerminalController.ConfigSource = .none,
        theme: TerminalTheme = .default,
        terminalConfiguration: TerminalConfiguration = .init(),
    ) {
        self.init(controller: TerminalController(
            configSource: configSource,
            theme: theme,
            terminalConfiguration: terminalConfiguration,
        ))
    }

    public init(controller: TerminalController) {
        self.controller = controller
        backgroundColor = controller.backgroundColor
        controller.addConfigObserver(ObjectIdentifier(self)) { [weak self] in
            self?.publishSoon(.config) { $0.publishBackgroundColor() }
        }
    }

    isolated deinit {
        controller.removeConfigObserver(ObjectIdentifier(self))
    }

    // MARK: - Forwarded from Controller (single source of truth)

    public var renderedConfig: String {
        controller.renderedConfig
    }

    public var effectiveColorScheme: TerminalColorScheme {
        controller.effectiveColorScheme
    }

    public var theme: TerminalTheme {
        controller.theme
    }

    public var terminalConfiguration: TerminalConfiguration {
        controller.terminalConfiguration
    }
}
