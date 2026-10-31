//
//  TerminalInputAccessoryView.swift
//  libghostty-spm
//

#if canImport(UIKit)
    #if !targetEnvironment(macCatalyst)
        import UIKit

        @MainActor
        final class TerminalInputAccessoryView: UIView {
            weak var terminalView: UITerminalView?

            var style: TerminalInputAccessoryStyle = .default {
                didSet { refreshContent() }
            }

            private let barHeight: CGFloat = 52
            private let buttonSize: CGFloat = 36

            private lazy var blurView = UIVisualEffectView(
                effect: makeBarEffect(),
            )
            private let scrollView = UIScrollView()
            private let stackView = UIStackView()
            private var blurLeadingConstraint: NSLayoutConstraint?
            private var blurTrailingConstraint: NSLayoutConstraint?
            private var blurTopConstraint: NSLayoutConstraint?
            private var blurBottomConstraint: NSLayoutConstraint?
            private var keyButtons: [AccessoryButton] = []
            private var modifierButtons: [(TerminalStickyModifierState.Modifier, AccessoryButton)] = []

            init(terminalView: UITerminalView) {
                self.terminalView = terminalView
                super.init(
                    frame: CGRect(
                        x: 0,
                        y: 0,
                        width: 0,
                        height: Self.preferredHeight(for: barHeight),
                    ),
                )
                autoresizingMask = .flexibleWidth
                setupViews()
                applyBarChrome()
                refreshContent()
                terminalView.stickyModifiers.onBarChange = { [weak self] in
                    self?.refreshContent()
                }
            }

            @available(*, unavailable)
            required init?(coder _: NSCoder) {
                fatalError("init(coder:) has not been implemented")
            }

            override var intrinsicContentSize: CGSize {
                CGSize(width: UIView.noIntrinsicMetric, height: preferredHeight)
            }

            func refreshContent() {
                let hasMarkedText = terminalView?.inputHandler.hasMarkedText ?? false
                let ctrlActivation = terminalView?.stickyModifiers.ctrl ?? .inactive
                let altActivation = terminalView?.stickyModifiers.alt ?? .inactive
                let commandActivation = terminalView?.stickyModifiers.command ?? .inactive

                keyButtons.forEach { $0.applyRegularStyle(style) }

                for (modifier, button) in modifierButtons {
                    let activation = switch modifier {
                    case .ctrl: ctrlActivation
                    case .alt: altActivation
                    case .command: commandActivation
                    }
                    button.applyModifierStyle(activation, isDisabled: hasMarkedText, style: style)
                }
            }

            func rebuildContent() {
                for view in stackView.arrangedSubviews {
                    stackView.removeArrangedSubview(view)
                    view.removeFromSuperview()
                }
                keyButtons.removeAll()
                modifierButtons.removeAll()

                let items = terminalView?.inputAccessoryItems ?? TerminalInputAccessoryItem.defaultItems
                addArrangedViews(items.map(makeView(for:)))
                refreshContent()
            }

            private func setupViews() {
                backgroundColor = .clear

                blurView.translatesAutoresizingMaskIntoConstraints = false
                blurView.clipsToBounds = true
                addSubview(blurView)

                let leading = blurView.leadingAnchor.constraint(equalTo: leadingAnchor)
                let trailing = blurView.trailingAnchor.constraint(equalTo: trailingAnchor)
                let top = blurView.topAnchor.constraint(equalTo: topAnchor)
                let bottom = blurView.bottomAnchor.constraint(equalTo: bottomAnchor)
                blurLeadingConstraint = leading
                blurTrailingConstraint = trailing
                blurTopConstraint = top
                blurBottomConstraint = bottom

                NSLayoutConstraint.activate([
                    leading,
                    trailing,
                    top,
                    bottom,
                    blurView.heightAnchor.constraint(equalToConstant: barHeight),
                ])

                scrollView.translatesAutoresizingMaskIntoConstraints = false
                scrollView.showsHorizontalScrollIndicator = false
                scrollView.showsVerticalScrollIndicator = false
                scrollView.alwaysBounceHorizontal = true
                scrollView.clipsToBounds = true
                blurView.contentView.addSubview(scrollView)

                NSLayoutConstraint.activate([
                    scrollView.leadingAnchor.constraint(equalTo: blurView.contentView.leadingAnchor),
                    scrollView.trailingAnchor.constraint(equalTo: blurView.contentView.trailingAnchor),
                    scrollView.topAnchor.constraint(equalTo: blurView.contentView.topAnchor),
                    scrollView.bottomAnchor.constraint(equalTo: blurView.contentView.bottomAnchor),
                ])

                stackView.translatesAutoresizingMaskIntoConstraints = false
                stackView.axis = .horizontal
                stackView.alignment = .center
                stackView.spacing = 8
                scrollView.addSubview(stackView)

                NSLayoutConstraint.activate([
                    stackView.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: 10),
                    stackView.trailingAnchor.constraint(
                        equalTo: scrollView.contentLayoutGuide.trailingAnchor,
                        constant: -10,
                    ),
                    stackView.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
                    stackView.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
                    stackView.heightAnchor.constraint(equalTo: scrollView.frameLayoutGuide.heightAnchor),
                ])

                rebuildContent()
            }

            private func addArrangedViews(_ views: [UIView]) {
                views.forEach { stackView.addArrangedSubview($0) }
            }

            private func makeDivider() -> UIView {
                let view = UIView()
                view.translatesAutoresizingMaskIntoConstraints = false
                view.backgroundColor = .secondaryLabel.withAlphaComponent(0.28)
                view.layer.cornerRadius = 3
                NSLayoutConstraint.activate([
                    view.widthAnchor.constraint(equalToConstant: 6),
                    view.heightAnchor.constraint(equalToConstant: 6),
                ])
                return view
            }

            private func makeView(for item: TerminalInputAccessoryItem) -> UIView {
                // Titles and glyphs come from the item itself
                // (`TerminalInputAccessoryItem.title` / `.systemImage`) so hosts
                // that render their own picker UI stay in sync with the bar.
                let title = item.title ?? ""
                switch item {
                case .ctrl:
                    return makeTrackedModifierButton(title: title, systemImage: item.systemImage ?? "", modifier: .ctrl)

                case .alt:
                    return makeTrackedModifierButton(title: title, systemImage: item.systemImage ?? "", modifier: .alt)

                case .command:
                    return makeTrackedModifierButton(title: title, systemImage: item.systemImage ?? "", modifier: .command)

                case .esc:
                    return makeTrackedKeyButton(title: title, systemImage: item.systemImage, key: .esc)

                case .tab:
                    return makeTrackedKeyButton(title: title, systemImage: item.systemImage, key: .tab)

                case .arrowLeft:
                    return makeTrackedKeyButton(title: title, systemImage: item.systemImage, key: .arrowLeft)

                case .arrowUp:
                    return makeTrackedKeyButton(title: title, systemImage: item.systemImage, key: .arrowUp)

                case .arrowDown:
                    return makeTrackedKeyButton(title: title, systemImage: item.systemImage, key: .arrowDown)

                case .arrowRight:
                    return makeTrackedKeyButton(title: title, systemImage: item.systemImage, key: .arrowRight)

                case let .symbol(symbol), let .presentedSymbol(symbol, _):
                    return makeTrackedKeyButton(title: title, presentation: item.presentation, key: .symbol(symbol))

                case .paste:
                    return makeTrackedKeyButton(title: title, systemImage: item.systemImage, key: .paste)

                case .divider:
                    return makeDivider()
                }
            }

            private func makeTrackedModifierButton(
                title: String,
                systemImage: String,
                modifier: TerminalStickyModifierState.Modifier,
            ) -> AccessoryButton {
                let button = makeModifierButton(
                    title: title,
                    systemImage: systemImage,
                    modifier: modifier,
                )
                modifierButtons.append((modifier, button))
                return button
            }

            private func makeTrackedKeyButton(
                title: String,
                presentation: TerminalInputAccessoryItemPresentation? = nil,
                systemImage: String? = nil,
                key: TerminalInputBarKey,
            ) -> AccessoryButton {
                let button = makeKeyButton(title: title, presentation: presentation, systemImage: systemImage, key: key)
                keyButtons.append(button)
                return button
            }

            private func makeModifierButton(
                title: String,
                systemImage: String,
                modifier: TerminalStickyModifierState.Modifier,
            ) -> AccessoryButton {
                let button = AccessoryButton(size: buttonSize) { [weak terminalView] in
                    terminalView?.stickyModifiers.toggle(modifier)
                }
                button.accessibilityLabel = title
                button.setImage(UIImage(systemName: systemImage), for: .normal)
                return button
            }

            private func makeKeyButton(
                title: String,
                presentation: TerminalInputAccessoryItemPresentation? = nil,
                systemImage: String? = nil,
                key: TerminalInputBarKey,
            ) -> AccessoryButton {
                let image: UIImage? = if case let .image(image, _) = presentation { image } else { nil }
                // A text key widens into a capsule for a label longer than
                // the circle holds; a glyph or image key stays round.
                let fitsTitle = systemImage == nil && image == nil
                let button = AccessoryButton(size: buttonSize, fitsTitle: fitsTitle) { [weak terminalView] in
                    terminalView?.handleInputBarKey(key)
                }
                button.accessibilityLabel = title

                if let systemImage {
                    button.setImage(UIImage(systemName: systemImage), for: .normal)
                } else if let image, image.isSymbolImage {
                    // An SF Symbol is a glyph, drawn like the built-in keys';
                    // filled, it swelled into a blot of the tint color.
                    button.setImage(image, for: .normal)
                } else if let image {
                    // The picture fills the circle, cropped by its corners.
                    button.contentHorizontalAlignment = .fill
                    button.contentVerticalAlignment = .fill
                    button.imageView?.contentMode = .scaleAspectFill
                    button.setImage(image, for: .normal)
                } else {
                    let label = if case let .text(text) = presentation { text } else { title }
                    var configuration = UIButton.Configuration.plain()
                    configuration.baseForegroundColor = .label
                    configuration.title = label
                    // One line, never wrapped: the capsule widens to the
                    // whole label instead.
                    configuration.titleLineBreakMode = .byClipping
                    configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8)
                    configuration.attributedTitle = AttributedString(
                        label,
                        attributes: AttributeContainer([
                            .font: UIFont.monospacedSystemFont(ofSize: 13, weight: .semibold),
                        ]),
                    )
                    button.configuration = configuration
                }

                return button
            }

            private var preferredHeight: CGFloat {
                Self.preferredHeight(for: barHeight)
            }

            private var currentOuterPadding: UIEdgeInsets {
                if #available(iOS 26, *) {
                    UIEdgeInsets(top: 0, left: 8, bottom: 8, right: 8)
                } else {
                    .zero
                }
            }

            private func makeBarEffect() -> UIVisualEffect {
                // visionOS windows are glass already and the SDK has no
                // `UIGlassEffect`; the blur is the bar's chrome there.
                #if !os(visionOS)
                    if #available(iOS 26, *) {
                        let effect = UIGlassEffect(style: .regular)
                        effect.isInteractive = true
                        return effect
                    }
                #endif
                return UIBlurEffect(style: .systemUltraThinMaterial)
            }

            private func applyBarChrome() {
                let padding = currentOuterPadding
                blurLeadingConstraint?.constant = padding.left
                blurTrailingConstraint?.constant = -padding.right
                blurTopConstraint?.constant = padding.top
                blurBottomConstraint?.isActive = !isFloatingBarLayout

                blurView.effect = makeBarEffect()
                blurView.layer.cornerCurve = .continuous
                blurView.layer.cornerRadius = if #available(iOS 26, *) {
                    barHeight / 2
                } else {
                    0
                }

                invalidateIntrinsicContentSize()
            }

            private var isFloatingBarLayout: Bool {
                if #available(iOS 26, *) {
                    true
                } else {
                    false
                }
            }

            private static func preferredHeight(for barHeight: CGFloat) -> CGFloat {
                if #available(iOS 26, *) {
                    barHeight + 8
                } else {
                    barHeight
                }
            }
        }

        private final class AccessoryButton: UIButton {
            private let size: CGFloat
            private let handler: () -> Void
            private let lockIndicator = UIView()

            init(size: CGFloat, fitsTitle: Bool = false, handler: @escaping () -> Void) {
                self.size = size
                self.handler = handler
                super.init(frame: .zero)

                translatesAutoresizingMaskIntoConstraints = false
                layer.cornerRadius = size / 2
                layer.cornerCurve = .continuous
                clipsToBounds = true

                tintColor = .label
                backgroundColor = UIColor.systemGray5.withAlphaComponent(0.92)

                titleLabel?.font = .systemFont(ofSize: 14, weight: .medium)
                imageView?.contentMode = .scaleAspectFit

                NSLayoutConstraint.activate([
                    fitsTitle
                        ? widthAnchor.constraint(greaterThanOrEqualToConstant: size)
                        : widthAnchor.constraint(equalToConstant: size),
                    heightAnchor.constraint(equalToConstant: size),
                ])
                if fitsTitle {
                    setContentHuggingPriority(.required, for: .horizontal)
                    setContentCompressionResistancePriority(.required, for: .horizontal)
                }

                lockIndicator.translatesAutoresizingMaskIntoConstraints = false
                lockIndicator.backgroundColor = tintColor
                lockIndicator.layer.cornerRadius = 1.5
                lockIndicator.isHidden = true
                addSubview(lockIndicator)

                NSLayoutConstraint.activate([
                    lockIndicator.centerXAnchor.constraint(equalTo: centerXAnchor),
                    lockIndicator.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -3),
                    lockIndicator.widthAnchor.constraint(equalToConstant: 14),
                    lockIndicator.heightAnchor.constraint(equalToConstant: 3),
                ])

                addAction(UIAction { [weak self] _ in
                    self?.handler()
                }, for: .touchUpInside)
            }

            @available(*, unavailable)
            required init?(coder _: NSCoder) {
                fatalError("init(coder:) has not been implemented")
            }

            func applyRegularStyle(_ style: TerminalInputAccessoryStyle) {
                isEnabled = true
                alpha = 1
                tintColor = style.regularForeground
                backgroundColor = style.regularBackground
                lockIndicator.isHidden = true
                lockIndicator.backgroundColor = tintColor
                configuration?.baseForegroundColor = tintColor
            }

            func applyModifierStyle(
                _ activation: TerminalStickyModifierState.Activation,
                isDisabled: Bool,
                style: TerminalInputAccessoryStyle,
            ) {
                isEnabled = !isDisabled
                alpha = isDisabled && activation == .inactive ? 0.45 : 1

                let isActive = activation != .inactive
                tintColor = isActive ? style.activeForeground : style.regularForeground
                backgroundColor = isActive ? style.activeBackground : style.regularBackground
                lockIndicator.isHidden = activation != .locked
                lockIndicator.backgroundColor = tintColor
                configuration?.baseForegroundColor = tintColor
            }
        }
    #endif
#endif
