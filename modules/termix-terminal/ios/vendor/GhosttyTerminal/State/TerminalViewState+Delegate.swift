//
//  TerminalViewState+Delegate.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/16.
//

import Foundation
import GhosttyKit

extension TerminalViewState:
    TerminalSurfaceTitleDelegate,
    TerminalSurfaceGridResizeDelegate,
    TerminalSurfaceFocusDelegate,
    TerminalSurfaceCloseDelegate,
    TerminalSurfaceBellDelegate,
    TerminalSurfaceDesktopNotificationDelegate,
    TerminalSurfacePwdDelegate,
    TerminalSurfaceScrollbarDelegate,
    TerminalSurfaceCommandFinishedDelegate,
    TerminalSurfaceLifecycleDelegate,
    TerminalSurfaceClipboardConfirmationDelegate,
    TerminalSurfaceColorChangeDelegate,
    TerminalSurfaceFontSizeDelegate
{
    /// Applies a change to this state on the main queue's next turn.
    ///
    /// Every `@Published` property below goes through here, and the reason is
    /// the same for all of them: SwiftUI runs a representable's
    /// `layoutSubviews` — and the responder changes that layout provokes —
    /// inside its own update pass. Publishing from there is what SwiftUI
    /// reports as "Publishing changes from within view updates is not allowed,
    /// this will cause undefined behavior", and the callbacks that can land
    /// inside an update are not a fixed list: `terminalDidResize` and
    /// `terminalDidChangeFocus` are the ones seen so far, but any of these can
    /// be reached from a rebuild that a layout started. One rule for the whole
    /// file is easier to keep true than a per-callback judgement that has to be
    /// re-made every time one is added.
    ///
    /// The cost is one runloop turn on state a host only renders. Changes
    /// collect in `pendingPublishes` and one block applies them all, newest
    /// per `key` (``TerminalPendingPublishes`` has the flood that made that
    /// necessary); different keys apply in the order they first arrived, and
    /// `weak self` keeps a detached state from being resurrected by a change
    /// nobody will see. The no-change checks run inside the closure, against
    /// the value at apply time: a check made at call time sees the value
    /// published before the turn, so it drops the second of X→Y→X and the
    /// state ends at Y.
    ///
    /// The closures further down are deliberately *not* routed through this.
    /// They are requests with an answer expected, not state: a clipboard
    /// confirmation must reach its host while the request is still live, and a
    /// close must act before the surface goes.
    func publishSoon(
        _ key: TerminalPendingPublishes.Key,
        _ apply: @escaping TerminalPendingPublishes.Apply,
    ) {
        pendingPublishes.set(key, apply)
        guard !pendingPublishes.isFlushScheduled else { return }
        pendingPublishes.isFlushScheduled = true
        terminalRunOnMainNextTurn { [weak self] in
            self?.flushPendingPublishes()
        }
    }

    /// Takes the batch before applying it: a change that an applied one
    /// provokes schedules the next turn's flush instead of joining this one.
    private func flushPendingPublishes() {
        pendingPublishes.isFlushScheduled = false
        for apply in pendingPublishes.take() {
            apply(self)
        }
    }

    /// The platform view's appearance callbacks — window attach, trait and
    /// effective-appearance changes — run inside SwiftUI's update pass like
    /// layout does, and adopting a scheme publishes.
    func adoptSoon(terminalColorScheme colorScheme: TerminalColorScheme) {
        publishSoon(.colorScheme) { $0.adopt(terminalColorScheme: colorScheme) }
    }

    public func terminalDidChangeTitle(_ title: String) {
        publishSoon(.title) {
            guard $0.title != title else { return }
            $0.title = title
        }
    }

    /// The metrics come from `synchronizeMetrics()`, which runs off the view's
    /// layout — the callback that first showed the update-pass problem. The
    /// turn of delay is invisible here in particular: the size had already
    /// reached the engine before this was called (`synchronizeMetrics` says so
    /// at length), so this notification only ever fed the host's own UI.
    public func terminalDidResize(_ size: TerminalGridMetrics) {
        publishSoon(.surfaceSize) {
            guard $0.surfaceSize != size else { return }
            $0.surfaceSize = size
        }
    }

    public func terminalDidChangeFocus(_ focused: Bool) {
        publishSoon(.focus) {
            guard $0.isFocused != focused else { return }
            $0.isFocused = focused
        }
    }

    public func terminalDidClose(processAlive: Bool) {
        onClose?(processAlive)
    }

    public func terminalDidRingBell() {
        // The instant the bell rang, not the instant it was published.
        let at = Date()
        pendingPublishes.bellRings += 1
        publishSoon(.bell) {
            $0.bellCount += $0.pendingPublishes.takeBellRings()
            $0.lastBellAt = at
        }
    }

    public func terminalDidRequestDesktopNotification(title: String, body: String) {
        let at = Date()
        publishSoon(.desktopNotification) {
            $0.lastDesktopNotificationTitle = title
            $0.lastDesktopNotificationBody = body
            $0.lastDesktopNotificationAt = at
        }
    }

    public func terminalDidChangeWorkingDirectory(_ path: String) {
        publishSoon(.workingDirectory) {
            guard $0.workingDirectory != path else { return }
            $0.workingDirectory = path
        }
    }

    public func terminalDidUpdateScrollbar(_ scrollbar: TerminalScrollbar) {
        publishSoon(.scrollbar) {
            guard $0.scrollbar != scrollbar else { return }
            $0.scrollbar = scrollbar
        }
    }

    public func terminalDidChangeColor(_ change: TerminalColorChange) {
        guard change.kind == .background else { return }
        publishSoon(.background) {
            // A reset (OSC 111) reports the config color with no marker of its own.
            $0.programBackgroundColor = change.color == $0.controller.backgroundColor ? nil : change.color
            $0.publishBackgroundColor()
        }
    }

    public func terminalDidChangeFontSize(_ fontSize: Float) {
        publishSoon(.fontSize) {
            guard $0.fontSize != fontSize else { return }
            $0.fontSize = fontSize
        }
    }

    public func terminalDidFinishCommand(exitCode: Int?, durationNanos: UInt64) {
        publishSoon(.commandFinished) {
            $0.lastCommandExitCode = exitCode
            $0.lastCommandDurationNanos = durationNanos
        }
    }

    public func terminalDidRequestClipboardConfirmation(_ request: TerminalClipboardConfirmationRequest) {
        guard let onClipboardConfirmationRequest else {
            // No host UI to ask. A paste the user started is theirs to
            // make — the host's Paste button always pasted before it ran
            // through the binding, and dropping it silently is worse than
            // what paste protection guards against. A program's own read or
            // write of the clipboard stays denied.
            request.respond(allow: request.kind == .paste)
            return
        }
        onClipboardConfirmationRequest(request)
    }

    public func terminalDidAttachSurface(_ surface: TerminalSurface) {
        self.surface = surface
    }

    public func terminalDidDetachSurface() {
        // Two views can report to one state while a SwiftUI swap keeps the
        // outgoing one mounted; its teardown must not drop the replacement
        // surface the incoming view attached. A freed surface reads nil.
        guard surface?.rawValue == nil else { return }
        surface = nil
        publishSoon(.background) {
            $0.programBackgroundColor = nil
            $0.publishBackgroundColor()
        }
    }
}
