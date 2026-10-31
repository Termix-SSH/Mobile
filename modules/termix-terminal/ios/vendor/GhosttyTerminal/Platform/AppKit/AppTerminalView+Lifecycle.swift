//
//  AppTerminalView+Lifecycle.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/17.
//

#if !canImport(UIKit) && canImport(AppKit)
    import AppKit

    /// SwiftUI focus-bridge hooks; behavior lives in +Lifecycle.
    struct FocusBridgeState {
        var onFocusChange: ((Bool) -> Void)?
    }

    extension AppTerminalView {
        /// Added once from `commonInit`. `.inVisibleRect` keeps it matched to
        /// the visible rect, so `updateTrackingAreas` never has to rebuild it
        /// — and must not sweep `trackingAreas`, which also holds areas a
        /// host or subclass added.
        func setupTrackingArea() {
            let options: NSTrackingArea.Options = [
                .mouseEnteredAndExited,
                .mouseMoved,
                .inVisibleRect,
                .activeAlways,
            ]
            let area = NSTrackingArea(
                rect: bounds,
                options: options,
                owner: self,
                userInfo: nil,
            )
            addTrackingArea(area)
        }

        override open var acceptsFirstResponder: Bool {
            true
        }

        override open func becomeFirstResponder() -> Bool {
            let result = super.becomeFirstResponder()
            core.setFocus(true)
            focusBridge.onFocusChange?(true)
            return result
        }

        override open func resignFirstResponder() -> Bool {
            let result = super.resignFirstResponder()
            core.setFocus(false)
            focusBridge.onFocusChange?(false)
            return result
        }

        override open func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            removeWindowObservers()
            // A new window (or none) starts visible; its next occlusion
            // change says otherwise.
            core.setWindowVisible(true)
            if window != nil {
                // SwiftUI/AppKit can temporarily detach and reattach the terminal view while
                // diffing the view hierarchy. Rebuilding on every reattach discards Ghostty's
                // scrollback/state, so only create a new surface when one does not already exist.
                if surface == nil {
                    core.rebuildIfReady()
                } else {
                    core.synchronizeMetrics()
                }
                updateMetalLayerMetrics()
                updateColorScheme()
                core.requestImmediateTick()

                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(windowDidBecomeKey),
                    name: NSWindow.didBecomeKeyNotification,
                    object: window,
                )
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(windowDidResignKey),
                    name: NSWindow.didResignKeyNotification,
                    object: window,
                )
                // Cross-display rescue: AppKit posts didChangeScreen when the
                // window's screen reference changes, even when the new screen
                // has the same backingScaleFactor (in which case
                // viewDidChangeBackingProperties does not fire). Listening
                // here lets us re-run metric sync on every screen transition
                // — required for the case where two displays share scale but
                // differ in geometry / color profile, and harmless when
                // viewDidChangeBackingProperties also fires for the
                // different-scale case.
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(windowDidChangeScreen),
                    name: NSWindow.didChangeScreenNotification,
                    object: window,
                )
                // A display that is reconfigured or reconnected under the
                // window (resolution change, a VM or remote display coming
                // back) leaves the window on the same screen, so
                // didChangeScreen stays silent; while it is away the window
                // can report a 1x scale. This is the notification that
                // says it is back.
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(screenParametersDidChange),
                    name: NSApplication.didChangeScreenParametersNotification,
                    object: nil,
                )
                // Minimizing, hiding the app (Cmd+H), and full cover all
                // arrive as occlusion changes. Without this a hidden window
                // with streaming output keeps drawing at display rate.
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(windowDidChangeOcclusionState),
                    name: NSWindow.didChangeOcclusionStateNotification,
                    object: window,
                )
                // Same runloop hop as `requestFocus`: attaching can happen
                // mid SwiftUI update, where the first-responder dance must
                // not mutate focus state.
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    (delegate as? TerminalViewState)?.replayPendingFocusIfNeeded()
                }
            } else {
                core.stopDisplayLink()
                core.setFocus(false)
            }
        }

        /// Window key state is not a first-responder change: reporting it
        /// through the focus bridge flips the host's FocusState, whose
        /// synchronizeFocus then resigns a view that is still first responder.
        @objc func windowDidBecomeKey(_: Notification) {
            let focused = window?.isKeyWindow == true
                && window?.firstResponder === self
            core.setFocus(focused)
        }

        @objc func windowDidResignKey(_: Notification) {
            core.setFocus(false)
        }

        @objc func windowDidChangeScreen(_: Notification) {
            refreshScreenMetrics()
        }

        @objc func screenParametersDidChange(_: Notification) {
            refreshScreenMetrics()
        }

        /// Re-derives scale and size now, so the next frame already uses
        /// the new screen's scale, then once more a runloop tick later:
        /// AppKit's layout pass and the window's new backingScaleFactor may
        /// settle only after the notification, and the second pass picks up
        /// whatever the first one read too early.
        func refreshScreenMetrics() {
            syncScreenMetrics()
            DispatchQueue.main.async { [weak self] in
                self?.syncScreenMetrics()
            }
        }

        private func syncScreenMetrics() {
            guard window != nil else { return }
            updateMetalLayerMetrics()
            core.synchronizeMetrics()
            core.requestImmediateTick()
        }

        /// The window's scale while it is on a screen. A window whose
        /// screen is momentarily gone (a display disconnecting or being
        /// reconfigured) reports 1x; rendering at that scale for the gap
        /// shows a blurry, oversized frame, so keep the scale the surface
        /// already has until a screen is back.
        func currentScaleFactor() -> Double {
            if let window, window.screen != nil {
                return Double(window.backingScaleFactor)
            }
            if let scale = core.syncedScale {
                return scale
            }
            return Double(
                window?.backingScaleFactor
                    ?? NSScreen.main?.backingScaleFactor ?? 2.0,
            )
        }

        @objc func windowDidChangeOcclusionState(_: Notification) {
            guard let window else { return }
            core.setWindowVisible(window.occlusionState.contains(.visible))
        }

        private func removeWindowObservers() {
            // Remove any existing key-window observers before registering for the
            // current window. AppKit can move the view directly between windows
            // without an intermediate nil attachment.
            NotificationCenter.default.removeObserver(
                self,
                name: NSWindow.didBecomeKeyNotification,
                object: nil,
            )
            NotificationCenter.default.removeObserver(
                self,
                name: NSWindow.didResignKeyNotification,
                object: nil,
            )
            NotificationCenter.default.removeObserver(
                self,
                name: NSWindow.didChangeScreenNotification,
                object: nil,
            )
            NotificationCenter.default.removeObserver(
                self,
                name: NSApplication.didChangeScreenParametersNotification,
                object: nil,
            )
            NotificationCenter.default.removeObserver(
                self,
                name: NSWindow.didChangeOcclusionStateNotification,
                object: nil,
            )
        }

        override open func setFrameSize(_ newSize: NSSize) {
            super.setFrameSize(newSize)
            core.fitToSize()
            core.requestImmediateTick()
        }

        override open func layout() {
            super.layout()
            core.fitToSize()
            core.requestImmediateTick()
        }

        override open func viewDidChangeBackingProperties() {
            super.viewDidChangeBackingProperties()
            updateMetalLayerMetrics()
            core.fitToSize()
            core.requestImmediateTick()
        }

        public func fitToSize() {
            core.fitToSize()
        }

        func updateMetalLayerMetrics() {
            guard bounds.width > 0, bounds.height > 0 else { return }
            let scale = core.scaleFactor()
            // Write to the actually-attached backing layer (not just the
            // cached `metalLayer` ivar). The render pipeline can swap
            // `self.layer` to an IOSurfaceLayer for IOSurface-backed
            // compositing; once that happens the cached CAMetalLayer
            // reference is detached from the view tree and writes to its
            // contentsScale are no-ops as far as what's visible. The
            // observable symptom is text rendered at half size after the
            // window crosses to a display with a different
            // backingScaleFactor.
            layer?.contentsScale = scale
            if let metal = layer as? CAMetalLayer {
                metal.drawableSize = CGSize(
                    width: bounds.width * scale,
                    height: bounds.height * scale,
                )
            }
            // Mirror to the cached ivar in case anything else still
            // reads through it during a transitional layout pass.
            metalLayer?.contentsScale = scale
            metalLayer?.drawableSize = CGSize(
                width: bounds.width * scale,
                height: bounds.height * scale,
            )
        }

        func enforceMetalLayerScale() {
            let scale = core.scaleFactor()
            if let layer, layer.contentsScale != scale {
                layer.contentsScale = scale
            }
            if let metalLayer, metalLayer.contentsScale != scale {
                metalLayer.contentsScale = scale
            }
        }

        override open func viewDidChangeEffectiveAppearance() {
            super.viewDidChangeEffectiveAppearance()
            updateColorScheme()
        }

        func updateColorScheme() {
            let scheme: TerminalColorScheme = switch effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) {
            case .darkAqua: .dark
            default: .light
            }
            surface?.setColorScheme(scheme.ghosttyValue)
            if let controller,
               let viewState = delegate as? TerminalViewState,
               viewState.controller === controller
            {
                viewState.adoptSoon(terminalColorScheme: scheme)
            } else {
                controller?.setColorScheme(scheme)
            }
        }
    }
#endif
