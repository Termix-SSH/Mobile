//
//  UITerminalView.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/16.
//

#if canImport(UIKit)
    import DisplayLink
    import GhosttyKit
    import UIKit

    @MainActor
    open class UITerminalView: UIView {
        let core = TerminalSurfaceCoordinator()

        // Grouped view state, one struct per concern. Each state type is
        // defined in the extension file that owns the behavior (+Keyboard,
        // +Interaction, +PinchZoom, +Lifecycle, +UITextInput); the storage
        // lives here because extensions cannot add stored properties. A new
        // stored value joins (or starts) its concern's struct — the root
        // class declares only these `var xxx: XxxState = .init()` lines,
        // plus the lazy objects that need `self`. Constants live as statics
        // in the extension that uses them.
        var hardwareKeyboard: HardwareKeyboardState = .init()
        var pointer: PointerInteractionState = .init()
        var momentumScroll: MomentumScrollState = .init()
        var focusBridge: FocusBridgeState = .init()
        var textInputBridge: TextInputBridgeState = .init()
        var touchSelection: TouchSelectionState = .init()
        #if !targetEnvironment(macCatalyst)
            var softwareKeyboard: SoftwareKeyboardState = .init()
            var fontZoom: FontZoomState = .init()
        #endif

        lazy var selectionContextMenuInteraction = UIContextMenuInteraction(delegate: self)
        lazy var inputHandler = TerminalTextInputHandler(view: self)

        /// Backing store for the iOS 16+ edit-menu interaction — untyped
        /// because stored properties cannot carry availability.
        private var _selectionEditMenuInteraction: Any?
        @available(iOS 16.0, *)
        var selectionEditMenuInteraction: UIEditMenuInteraction {
            if let interaction = _selectionEditMenuInteraction as? UIEditMenuInteraction {
                return interaction
            }
            let interaction = UIEditMenuInteraction(delegate: self)
            addInteraction(interaction)
            _selectionEditMenuInteraction = interaction
            return interaction
        }

        #if !targetEnvironment(macCatalyst)
            lazy var terminalInputAccessory = TerminalInputAccessoryView(terminalView: self)
            let stickyModifiers: TerminalStickyModifierState = .init()
        #endif

        #if !targetEnvironment(macCatalyst)
            open var inputAccessoryStyle: TerminalInputAccessoryStyle {
                get { terminalInputAccessory.style }
                set { terminalInputAccessory.style = newValue }
            }

            open var inputAccessoryItems: [TerminalInputAccessoryItem] = TerminalInputAccessoryItem.defaultItems {
                didSet {
                    terminalInputAccessory.rebuildContent()
                    reloadInputViews()
                }
            }

            /// Toggles the software keyboard the way a clean tap does: the
            /// touch path calls this after the tap's click has been sent.
            /// Declared in the class body so a host's `makePlatformView`
            /// subclass can override it — a keyboard lock overrides to do
            /// nothing, and the click still lands.
            open func toggleSoftwareKeyboard() {
                if softwareKeyboard.isVisible {
                    resignFirstResponder()
                } else {
                    becomeFirstResponder()
                }
            }
        #endif

        /// Terminal-local touch selection and the native edit menu on iOS, on by default.
        /// Single tap clears selection or a menu, otherwise clicks and toggles the keyboard.
        /// Double tap selects a word, triple tap selects a row.
        /// Selection gestures and menus leave keyboard visibility unchanged.
        /// Long press opens the menu; one finger extends a selection and two fingers scroll locally.
        /// Set false to opt out: no touch selection at all, a tap clicks and toggles the keyboard.
        /// Mac Catalyst always uses the pointer selection path; there this stays false.
        open var usesInlineTextSelection: Bool {
            get { touchSelection.enabled }
            set {
                #if !targetEnvironment(macCatalyst)
                    if !newValue {
                        dismissTouchSelection()
                    }
                    touchSelection.enabled = newValue
                    updateTouchSelectionGestures()
                #endif
            }
        }

        /// Shows the system text loupe over the moving endpoint while a finger
        /// drags a selection handle or extends a selection, on by default.
        /// It needs iOS 17 or later and never appears on visionOS or Mac Catalyst.
        open var usesTouchSelectionLoupe: Bool {
            get { touchSelection.loupeEnabled }
            set {
                if !newValue {
                    endTouchSelectionLoupe()
                }
                touchSelection.loupeEnabled = newValue
            }
        }

        /// The caret the loupe tracks for the moving endpoint, in view points.
        /// `cellRect` is the endpoint's cell; the default is a 2-point bar on
        /// its leading edge for the start, its trailing edge for the end.
        /// Return `.null` to let the loupe follow the finger alone.
        open func touchSelectionLoupeCaretRect(forEndpointCell cellRect: CGRect, isStart: Bool) -> CGRect {
            CGRect(x: isStart ? cellRect.minX : cellRect.maxX - 2, y: cellRect.minY, width: 2, height: cellRect.height)
        }

        /// Builds the menu when no text is selected, on iOS 16 and later.
        /// Override to localize, group or reorder the default actions and system menus.
        /// Action identifiers are terminal.paste, terminal.select and terminal.selectAll.
        /// The returned elements include UIKit's AutoFill menu when available.
        /// The host owns the complete menu, including grouping and separators.
        open func touchMenuItems(for context: TerminalTouchMenuContext) -> [UIMenuElement] {
            defaultTouchMenuItems(at: context.sourcePoint, selecting: false) + context.systemMenuItems
        }

        /// Builds the menu while text is selected, independently of touchMenuItems(for:).
        /// Action identifiers are terminal.copy, terminal.paste and terminal.selectAll.
        /// The returned elements include UIKit's AutoFill menu when available.
        /// Use the context's text snapshot in host handlers and capture owners weakly.
        open func touchSelectionMenuItems(for context: TerminalTouchSelectionMenuContext) -> [UIMenuElement] {
            defaultTouchMenuItems(at: context.sourcePoint, selecting: true) + context.systemMenuItems
        }

        open weak var delegate: (any TerminalSurfaceViewDelegate)? {
            get { core.delegate }
            set { core.delegate = newValue }
        }

        open var controller: TerminalController? {
            get { core.controller }
            set { core.controller = newValue }
        }

        open var configuration: TerminalSurfaceOptions {
            get { core.configuration }
            set { core.configuration = newValue }
        }

        /// Whether this surface should keep drawing — the UIKit twin of the
        /// AppKit view's method of the same name. A host that keeps several
        /// surfaces mounted at once (tabs hidden behind `opacity(0)`) marks
        /// the hidden ones invisible: the surface keeps its grid, scrollback,
        /// and session — only rendering stops and the display link is
        /// released.
        open func setSurfaceVisible(_ visible: Bool) {
            if !visible {
                stopMomentumScrolling(sendTerminalEndEvent: false)
                dismissTouchSelection()
            }
            core.setDisplayVisible(visible)
        }

        public var surface: TerminalSurface? {
            core.surface
        }

        open var hasText: Bool {
            true
        }

        override open var canBecomeFirstResponder: Bool {
            true
        }

        override public init(frame: CGRect) {
            super.init(frame: frame)
            commonInit()
        }

        @available(*, unavailable)
        public required init?(coder _: NSCoder) {
            fatalError("init(coder:) has not been implemented")
        }

        func commonInit() {
            backgroundColor = .clear
            isOpaque = false
            isUserInteractionEnabled = true
            updateDisplayScale()

            core.isAttached = { [weak self] in self?.window != nil }
            core.displayLinkContext = .view(self)
            core.scaleFactor = { [weak self] in
                Double(self?.resolvedDisplayScale() ?? UITerminalView.fallbackDisplayScale)
            }
            core.viewSize = { [weak self] in
                guard let self else { return (0, 0) }
                return (bounds.width, bounds.height)
            }
            core.platformSetup = { [weak self] config in
                guard let self else { return }
                config.platform_tag = GHOSTTY_PLATFORM_IOS
                config.platform = ghostty_platform_u(
                    ios: ghostty_platform_ios_s(
                        uiview: Unmanaged.passUnretained(self).toOpaque(),
                    ),
                )
            }
            core.onMetricsUpdate = { [weak self] in
                self?.updateSublayerFrames()
            }
            core.onCellSizeDidChange = { [weak self] in
                self?.refreshTextInputGeometry(reason: "cell-size-action")
            }
            core.onMouseShape = { [weak self] shape in
                self?.applyMouseShape(shape)
            }
            core.onPostRender = { [weak self] in
                self?.enforceSublayerScale()
                self?.refreshTouchSelection()
            }

            setupApplicationLifecycleObservers()
            syncApplicationActiveState()
            setupPlatformInput()
            #if !targetEnvironment(macCatalyst)
                setupKeyboardObservers()
            #endif
        }

        open func selectionMenuPoint(at point: CGPoint) -> CGPoint? {
            logPointerSelectionDiagnostics(
                context: "selectionMenuPoint",
                point: point,
            )
            if let rect = pointer.lastSelectionRect {
                let pointIsInsidePointerSelection = rect.insetBy(dx: -4, dy: -4).contains(point)
                guard pointIsInsidePointerSelection else {
                    TerminalDebugLog.log(
                        .input,
                        "selection menu miss point=\(NSCoder.string(for: point)) outside pointer selection",
                    )
                    return nil
                }
                guard surface?.hasSelection() == true else {
                    TerminalDebugLog.log(
                        .input,
                        "selection menu miss point=\(NSCoder.string(for: point)) inside pointer selection without active selection",
                    )
                    return nil
                }
                TerminalDebugLog.log(
                    .input,
                    "selection menu hit point=\(NSCoder.string(for: point)) inside pointer selection",
                )
                return point
            }

            guard surface?.hasSelection() == true else {
                TerminalDebugLog.log(
                    .input,
                    "selection menu miss point=\(NSCoder.string(for: point))",
                )
                return nil
            }

            guard surface?.selectionContainsQuicklookWord() == true else {
                TerminalDebugLog.log(
                    .input,
                    "selection menu miss point=\(NSCoder.string(for: point)) outside quicklook word",
                )
                return nil
            }

            TerminalDebugLog.log(
                .input,
                "selection menu hit point=\(NSCoder.string(for: point))",
            )
            return point
        }

        open func showSelectionCopyMenu(at point: CGPoint) {
            becomeFirstResponder()
            if #available(iOS 16.0, *) {
                // UIMenuController stopped presenting anything on modern
                // iOS — the menu silently never appears. The edit-menu
                // interaction is its replacement; content still comes from
                // the responder chain (canPerformAction), so Copy shows
                // exactly when a selection exists.
                selectionEditMenuInteraction.presentEditMenu(
                    with: UIEditMenuConfiguration(identifier: nil, sourcePoint: point),
                )
            } else {
                let menu = UIMenuController.shared
                menu.menuItems = nil
                menu.showMenu(
                    from: self,
                    rect: CGRect(x: point.x, y: point.y, width: 1, height: 1),
                )
                menu.update()
            }
        }

        @discardableResult
        open func copySelectedTextToPasteboard() -> Bool {
            if touchSelection.range != nil {
                return copyTouchSelection()
            }
            #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
                    accessibilityValue = nil
                }
            #endif
            guard let selection = surface?.readSelectionResult(), !selection.text.isEmpty else {
                return false
            }
            let text = TerminalCopyText.clean(selection.text, startColumn: selectionStartColumn(selection))
            UIPasteboard.general.string = text
            #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
                    accessibilityValue = text
                }
            #endif
            TerminalDebugLog.log(
                .input,
                "selection copied bytes=\(text.utf8.count) lines=\(TerminalInputText.lineCount(in: text))",
            )
            return true
        }

        open func selectionContextMenuConfiguration(
            at _: CGPoint,
        ) -> UIContextMenuConfiguration {
            UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
                UIMenu(children: self?.selectionContextMenuElements() ?? [])
            }
        }

        open func selectionContextMenuElements() -> [UIMenuElement] {
            let copy = UIAction(
                title: String(localized: "Copy", bundle: .module),
                image: UIImage(systemName: "doc.on.doc"),
            ) { [weak self] _ in
                self?.copySelectedTextToPasteboard()
            }
            return [copy]
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        #if !targetEnvironment(macCatalyst)
            func setupKeyboardObservers() {
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(keyboardDidShow),
                    name: UIResponder.keyboardDidShowNotification,
                    object: nil,
                )
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(keyboardDidHide),
                    name: UIResponder.keyboardDidHideNotification,
                    object: nil,
                )
            }

            @objc func keyboardDidShow(_: Notification) {
                guard isFirstResponder else { return }
                // The accessory-only bar of a hardware keyboard counts too:
                // a tap on the terminal is the only way to put the keyboard
                // UI away, and resigning is no longer destructive — the next
                // tap (or pointer click, or the host's focus handoff)
                // re-acquires first responder and hardware input with it.
                softwareKeyboard.isVisible = true
            }

            /// A hide whose end frame is still on screen is the software
            /// keys collapsing to the accessory bar: iOS 27 posts it when
            /// hardware-keyboard input starts, and the bar stays up and
            /// ours, so the next tap must put it away, not re-acquire.
            @objc func keyboardDidHide(_ notification: Notification) {
                softwareKeyboard.isVisible = isFirstResponder && keyboardEndFrameIsOnScreen(notification)
            }

            private func keyboardEndFrameIsOnScreen(_ notification: Notification) -> Bool {
                #if os(visionOS)
                    return false
                #else
                    guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
                          let screen = window?.screen
                    else { return false }
                    // A fully hidden keyboard ends below the screen, touching
                    // its bottom edge: `intersects` is false for that.
                    return frame.intersects(screen.bounds)
                #endif
            }
        #endif

        func refreshTextInputGeometry(reason: String) {
            guard isFirstResponder || inputHandler.hasMarkedText else { return }
            TerminalDebugLog.log(.ime, "refresh text geometry reason=\(reason)")
            inputHandler.notifyGeometryDidChange(reason: reason)
        }

        func refreshInputAccessoryContent() {
            #if !targetEnvironment(macCatalyst)
                terminalInputAccessory.refreshContent()
            #endif
        }
    }
#endif
