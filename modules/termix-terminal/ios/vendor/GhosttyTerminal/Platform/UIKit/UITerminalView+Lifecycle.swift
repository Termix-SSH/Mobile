//
//  UITerminalView+Lifecycle.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/17.
//

#if canImport(UIKit)
    import UIKit

    /// SwiftUI focus-bridge hooks; behavior lives in +Lifecycle.
    struct FocusBridgeState {
        var onFocusChange: ((Bool) -> Void)?
        /// Fires when the view lands in a window. The SwiftUI focus bridge
        /// needs it: a focus request that arrives before the window exists
        /// cannot become first responder and would otherwise be dropped —
        /// the launch-time case, where the surface is created and focused in
        /// the same transaction.
        var onWindowAttach: (() -> Void)?
    }

    extension UITerminalView {
        func setupApplicationLifecycleObservers() {
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(applicationDidEnterBackground),
                name: UIApplication.didEnterBackgroundNotification,
                object: nil,
            )
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(applicationDidBecomeActive),
                name: UIApplication.didBecomeActiveNotification,
                object: nil,
            )
            // Scene-based apps activate scene-first; on cold launch the
            // app-level notification can precede this view's registration.
            // Either signal re-syncs the same state.
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(applicationDidBecomeActive),
                name: UIScene.didActivateNotification,
                object: nil,
            )
            // With several scenes (iPad multi-window, Stage Manager) one can
            // go to the background while the app stays foreground, so the
            // app-level notifications never fire for it. These follow this
            // view's own scene; the handlers ignore every other scene.
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(sceneDidEnterBackground),
                name: UIScene.didEnterBackgroundNotification,
                object: nil,
            )
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(sceneWillEnterForeground),
                name: UIScene.willEnterForegroundNotification,
                object: nil,
            )
        }

        /// Whether this view's scene is on screen, `nil` when the view has no
        /// scene to ask (detached, or an app without scenes). An inactive
        /// foreground scene still counts: Stage Manager shows every window
        /// but the key one as `foregroundInactive`.
        var isWindowSceneForeground: Bool? {
            guard let scene = window?.windowScene else { return nil }
            switch scene.activationState {
            case .foregroundActive, .foregroundInactive:
                return true
            default:
                return false
            }
        }

        func syncApplicationActiveState() {
            core.setApplicationActive(
                isWindowSceneForeground
                    ?? (UIApplication.shared.applicationState == .active),
            )
        }

        private func isOwnScene(_ notification: Notification) -> Bool {
            guard let scene = notification.object as? UIScene else { return false }
            return scene === window?.windowScene
        }

        @objc func applicationDidEnterBackground(_: Notification) {
            TerminalDebugLog.log(.lifecycle, "application did enter background")
            suspendForBackground()
        }

        @objc func sceneDidEnterBackground(_ notification: Notification) {
            guard isOwnScene(notification) else { return }
            TerminalDebugLog.log(.lifecycle, "scene did enter background")
            suspendForBackground()
        }

        private func suspendForBackground() {
            stopMomentumScrolling(sendTerminalEndEvent: false)
            dismissTouchSelection()
            stopKeyRepeat()
            core.setApplicationActive(false)
        }

        @objc func applicationDidBecomeActive(_: Notification) {
            TerminalDebugLog.log(.lifecycle, "application did become active")
            updateDisplayScale()
            updateColorScheme()
            // Another scene activating says nothing about this one: a view
            // whose scene is still in the background stays suspended.
            core.setApplicationActive(isWindowSceneForeground ?? true)
        }

        /// A scene can come back on screen without activating (a Stage
        /// Manager window that is not the key one), so the activation
        /// notification above would never resume it.
        @objc func sceneWillEnterForeground(_ notification: Notification) {
            guard isOwnScene(notification) else { return }
            TerminalDebugLog.log(.lifecycle, "scene will enter foreground")
            updateDisplayScale()
            updateColorScheme()
            core.setApplicationActive(true)
        }

        override open func didMoveToWindow() {
            super.didMoveToWindow()
            TerminalDebugLog.log(
                .lifecycle,
                "didMoveToWindow attached=\(window != nil)",
            )
            updateDisplayScale()
            if window != nil {
                // Re-read the application state on every attach. The
                // did-become-active notification can slip past a view whose
                // registration races cold launch — the view then believes
                // the app inactive forever, its surface is born occluded,
                // the renderer skips every draw, and the first terminal of a
                // cold launch sits blank. The attach is the moment we
                // reliably know the answer matters.
                syncApplicationActiveState()
                // UIKit detaches the hierarchy temporarily all the time — a
                // full-screen cover (tab switcher) pulls the presenter's view
                // out of the window. Rebuilding on every reattach discards
                // Ghostty's grid and scrollback, so a surface that already
                // exists is kept and only re-measured, matching the AppKit
                // twin's reattach guard.
                if core.surface == nil {
                    core.rebuildIfReady()
                } else {
                    core.synchronizeMetrics()
                }
                updateColorScheme()
                core.requestImmediateTick()
                // Defer sublayer frame and metrics sync to the next runloop
                // so that AutoLayout has resolved final bounds.
                DispatchQueue.main.async { [weak self] in
                    guard let self, window != nil else { return }
                    updateSublayerFrames()
                    core.fitToSize()
                }
                focusBridge.onWindowAttach?()
                // Same runloop hop as `requestFocus`: attaching can happen
                // mid SwiftUI update, where the first-responder dance must
                // not mutate focus state.
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    (delegate as? TerminalViewState)?.replayPendingFocusIfNeeded()
                }
            } else {
                // The surface survives on purpose: this detach may be a
                // cover's temporary one, and the view's own teardown frees
                // the surface when the terminal really goes away.
                dismissTouchSelection()
                cancelReportedPointerButton()
                // The momentum link retains this view and would keep
                // scrolling a detached surface until the fling decays.
                stopMomentumScrolling(sendTerminalEndEvent: false)
                core.stopDisplayLink()
            }
        }

        override open func layoutSubviews() {
            super.layoutSubviews()
            TerminalDebugLog.log(
                .metrics,
                "layoutSubviews bounds=\(NSCoder.string(for: bounds))",
            )
            updateSublayerFrames()
            core.fitToSize()
            refreshTouchSelection()
        }

        /// The scale used when neither the window nor the trait collection can
        /// say. visionOS has no `UIScreen` — a window there is a rectangle in a
        /// shared space, not on a display — and its content is rendered at 2×
        /// for the compositor to resample; the trait collection reports 2.0 on
        /// every device so far, and this is what `traitCollection.displayScale`
        /// falls back to as well.
        static var fallbackDisplayScale: CGFloat {
            #if os(visionOS)
                2.0
            #else
                UIScreen.main.nativeScale
            #endif
        }

        func resolvedDisplayScale() -> CGFloat {
            #if !os(visionOS)
                if let screen = window?.screen {
                    return screen.nativeScale
                }
            #endif
            if traitCollection.displayScale > 0 {
                return traitCollection.displayScale
            }
            return Self.fallbackDisplayScale
        }

        func updateDisplayScale() {
            let scale = resolvedDisplayScale()
            TerminalDebugLog.log(
                .metrics,
                "updateDisplayScale scale=\(String(format: "%.2f", scale))",
            )
            contentScaleFactor = scale
            layer.contentsScale = scale
            updateSublayerFrames()
        }

        /// Where the engine's layer sits: the view's bounds, except while a
        /// resize throttle is holding the surface at an older size. Then
        /// the layer stays that size, anchored top-left, so the pixels it
        /// holds are shown 1:1 and the uncovered strip is background. A
        /// layer stretched to the new bounds shows the old frame scaled,
        /// and the engine — deriving `contentsScale` from its pixel size
        /// over the layer's points — writes a wrong scale on each draw
        /// that `enforceSublayerScale` then undoes: a whole-pane flicker
        /// for as long as the window is open. `layoutSubviews` sizes the
        /// surface right after placing the layer, so with the throttle off
        /// the surface catches up inside the same pass and
        /// `onMetricsUpdate` re-places the layer at the bounds.
        var sublayerFrame: CGRect {
            guard let synced = core.syncedViewSize,
                  synced.width != bounds.width || synced.height != bounds.height
            else { return bounds }
            // The full synced size, even past the bounds on a shrink: a
            // frame clipped to the bounds would scale the pixels just the
            // same. The view's layer masks the overflow instead.
            return CGRect(x: 0, y: 0, width: synced.width, height: synced.height)
        }

        func updateSublayerFrames() {
            let scale = resolvedDisplayScale()
            contentScaleFactor = scale
            layer.contentsScale = scale
            layer.masksToBounds = true
            guard let sublayers = layer.sublayers else { return }
            let frame = sublayerFrame
            // UIKit owns the layers of subviews used for text input and menus.
            for sublayer in sublayers where !(sublayer.delegate is UIView) {
                sublayer.frame = frame
                sublayer.contentsScale = scale
            }
        }

        func enforceSublayerScale() {
            let scale = resolvedDisplayScale()
            guard let sublayers = layer.sublayers else { return }
            let frame = sublayerFrame
            for sublayer in sublayers where !(sublayer.delegate is UIView) {
                if sublayer.contentsScale != scale {
                    sublayer.contentsScale = scale
                }
                if sublayer.frame != frame {
                    sublayer.frame = frame
                }
            }
        }

        public func fitToSize() {
            core.fitToSize()
        }

        override open func traitCollectionDidChange(
            _ previousTraitCollection: UITraitCollection?,
        ) {
            super.traitCollectionDidChange(previousTraitCollection)
            updateDisplayScale()
            if traitCollection.hasDifferentColorAppearance(
                comparedTo: previousTraitCollection,
            ) {
                updateColorScheme()
            }
        }

        func updateColorScheme() {
            let style = traitCollection.userInterfaceStyle
            let scheme: TerminalColorScheme = style == .dark ? .dark : .light
            TerminalDebugLog.log(.lifecycle, "updateColorScheme scheme=\(scheme)")
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

        @discardableResult
        override open func becomeFirstResponder() -> Bool {
            let result = super.becomeFirstResponder()
            // A failed acquire (view not in a window yet) must not report
            // focus: the SwiftUI bridge would record this surface as focused
            // while another view keeps eating the keyboard.
            guard result else { return false }
            core.setFocus(true)
            focusBridge.onFocusChange?(true)
            return result
        }

        @discardableResult
        override open func resignFirstResponder() -> Bool {
            let result = super.resignFirstResponder()
            #if !targetEnvironment(macCatalyst)
                // A handoff to another responder keeps the keyboard up, so
                // `keyboardDidHide` never fires for this view; the flag means
                // "this view owns the visible keyboard" and must drop here.
                softwareKeyboard.isVisible = false
            #endif
            stopKeyRepeat()
            core.setFocus(false)
            focusBridge.onFocusChange?(false)
            return result
        }
    }
#endif
