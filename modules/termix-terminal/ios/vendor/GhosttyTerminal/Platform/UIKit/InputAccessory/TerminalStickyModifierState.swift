//
//  TerminalStickyModifierState.swift
//  libghostty-spm
//

#if canImport(UIKit)
    #if !targetEnvironment(macCatalyst)
        import Foundation

        @MainActor
        final class TerminalStickyModifierState {
            enum Activation { case inactive, armed, locked }
            enum Modifier { case ctrl, alt, command }

            private(set) var ctrl: Activation = .inactive
            private(set) var alt: Activation = .inactive
            private(set) var command: Activation = .inactive

            /// The host's slot (`setStickyModifierChangeHandler`). The bundled
            /// bar has its own so neither can overwrite the other — the lazy
            /// bar is materialised by paths a custom-bar host cannot avoid.
            var onChange: (() -> Void)?
            var onBarChange: (() -> Void)?

            private var lastCtrlTap: Date = .distantPast
            private var lastAltTap: Date = .distantPast
            private var lastCommandTap: Date = .distantPast
            private let doubleTapInterval: TimeInterval = 0.3

            func toggle(_ modifier: Modifier) {
                switch modifier {
                case .ctrl:
                    ctrl = nextActivation(ctrl, lastTap: lastCtrlTap)
                    lastCtrlTap = Date()
                case .alt:
                    alt = nextActivation(alt, lastTap: lastAltTap)
                    lastAltTap = Date()
                case .command:
                    command = nextActivation(command, lastTap: lastCommandTap)
                    lastCommandTap = Date()
                }
                notifyChange()
            }

            func consumeForNextKey() -> TerminalInputModifiers {
                var mods = TerminalInputModifiers()
                if ctrl != .inactive {
                    mods.insert(.ctrl)
                }
                if alt != .inactive {
                    mods.insert(.alt)
                }
                if command != .inactive {
                    mods.insert(.super_)
                }
                // Only an armed modifier changes on consume; with none armed
                // (nothing active, or locks only) there is no transition to
                // report to the host or the bar.
                let hasArmed = ctrl == .armed || alt == .armed || command == .armed
                guard hasArmed else { return mods }
                if ctrl == .armed {
                    ctrl = .inactive
                }
                if alt == .armed {
                    alt = .inactive
                }
                if command == .armed {
                    command = .inactive
                }
                notifyChange()
                return mods
            }

            var hasActiveModifiers: Bool {
                ctrl != .inactive || alt != .inactive || command != .inactive
            }

            func reset() {
                guard hasActiveModifiers else { return }
                ctrl = .inactive
                alt = .inactive
                command = .inactive
                notifyChange()
            }

            private func notifyChange() {
                onChange?()
                onBarChange?()
            }

            private func nextActivation(
                _ current: Activation,
                lastTap: Date,
            ) -> Activation {
                switch current {
                case .inactive:
                    return .armed
                case .armed:
                    if Date().timeIntervalSince(lastTap) < doubleTapInterval {
                        return .locked
                    }
                    return .inactive
                case .locked:
                    return .inactive
                }
            }
        }
    #endif
#endif
