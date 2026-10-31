//
//  UITerminalView+KeyCommands.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/17.
//

#if canImport(UIKit)
    import UIKit

    extension UITerminalView {
        /// Ctrl combos the text input system would otherwise interpret
        /// itself: as a `UITextInput` first responder, the view hands
        /// hardware keys to UIKit's text machinery, which consumes most
        /// Ctrl+letter chords (its emacs-style bindings) before
        /// `pressesBegan` ever fires. Registering them as key commands with
        /// priority over system behavior lets the terminal receive those chords.
        private static let controlKeyCommandInputs: [String] = {
            var inputs = (UInt8(ascii: "a") ... UInt8(ascii: "z")).map {
                String(UnicodeScalar($0))
            }
            inputs += (UInt8(ascii: "0") ... UInt8(ascii: "9")).map {
                String(UnicodeScalar($0))
            }
            inputs += [" ", "-", "=", "[", "]", "\\", ";", "'", ",", ".", "/", "`"]
            return inputs
        }()

        private static let controlKeyCommands: [UIKeyCommand] =
            controlKeyCommandInputs.map { input in
                let command = UIKeyCommand(
                    input: input,
                    modifierFlags: .control,
                    action: #selector(handleControlKeyCommand(_:)),
                )
                command.wantsPriorityOverSystemBehavior = true
                return command
            }

        /// Escape, which the text input system also handles itself: for a
        /// `UITextInput` first responder UIKit's system behaviour for a
        /// hardware Escape is to end editing — the view resigns, the keyboard
        /// (and the accessory bar over it) drops — and that runs before
        /// `pressesBegan` ever sees the key. A terminal cannot give Escape
        /// away, so it is claimed the same way as the Ctrl combos, under
        /// every modifier set a program might bind (Cmd-Escape stays with
        /// the system).
        ///
        /// Catalyst needs this just the same. It has no software keyboard to
        /// drop, but the end-editing behaviour is the text input system's,
        /// not the keyboard's: an unclaimed Escape resigns the view there
        /// too, the press never reaches `pressesBegan`, and every key after
        /// it goes nowhere until the next click.
        private static let escapeKeyCommands: [UIKeyCommand] = {
            let modifierSets: [UIKeyModifierFlags] = [
                [], .shift, .control, .alternate,
                [.shift, .control], [.shift, .alternate], [.control, .alternate],
                [.shift, .control, .alternate],
            ]
            return modifierSets.map { flags in
                let command = UIKeyCommand(
                    input: UIKeyCommand.inputEscape,
                    modifierFlags: flags,
                    action: #selector(handleEscapeKeyCommand(_:)),
                )
                command.wantsPriorityOverSystemBehavior = true
                return command
            }
        }()

        /// Catalyst included: its text-input system also swallows Ctrl+letter
        /// before `pressesBegan` (the Control press itself arrives, the letter
        /// never does), and the key command is the only route left. The
        /// per-runloop claim below dedupes against a press on systems that
        /// deliver both.
        ///
        /// UIKit asks for this list on every key event, so it can change with
        /// the view's state: while a composition is on screen every key is the
        /// input method's (Escape cancels it — see `TerminalIMEComposition`),
        /// and the Escape commands step aside so the press takes the deferral
        /// path in `pressesBegan` as it always did.
        override open var keyCommands: [UIKeyCommand]? {
            var commands = super.keyCommands ?? []
            commands.append(contentsOf: Self.controlKeyCommands)
            if !inputHandler.hasMarkedText {
                commands.append(contentsOf: Self.escapeKeyCommands)
            }
            return commands
        }

        @objc private func handleControlKeyCommand(_ command: UIKeyCommand) {
            guard let input = command.input, input.count == 1,
                  let character = input.first,
                  let press = TerminalKeyPress(
                      typing: character,
                      modifiers: TerminalInputModifiers(from: command.modifierFlags),
                  )
            else { return }
            guard claimKeyCommandDelivery(
                input: input,
                modifierFlags: command.modifierFlags,
            ) else { return }
            TerminalDebugLog.log(
                .input,
                "uikit key command input=\(TerminalDebugLog.describe(input)) mods=0x\(String(command.modifierFlags.rawValue, radix: 16))",
            )
            // A chord, not typing: it closes an open composition the way a
            // hardware press would, and takes the shared key path.
            _ = sendInputKey(press)
        }

        /// The Escape command's action: the key goes to the surface as a
        /// press, exactly as `pressesBegan` would have sent it, and the view
        /// stays first responder. The command is not offered while text is
        /// marked (see `keyCommands`), so no composition is open here.
        @objc private func handleEscapeKeyCommand(_ command: UIKeyCommand) {
            guard claimKeyCommandDelivery(
                input: UIKeyCommand.inputEscape,
                modifierFlags: command.modifierFlags,
            ) else { return }
            TerminalDebugLog.log(
                .input,
                "uikit key command input=escape mods=0x\(String(command.modifierFlags.rawValue, radix: 16))",
            )
            _ = sendInputKey(TerminalKeyPress(
                .escape,
                modifiers: TerminalInputModifiers(from: command.modifierFlags),
            ))
        }

        /// Whether this path gets to deliver a key that is also registered
        /// as a `UIKeyCommand` (a Ctrl combo, Escape). Whichever of
        /// `pressesBegan` / the key command runs first wins the press; the
        /// entry expires at the end of the runloop turn, before the key can
        /// physically repeat.
        func claimKeyCommandDelivery(
            input: String,
            modifierFlags: UIKeyModifierFlags,
        ) -> Bool {
            let relevant = modifierFlags.intersection(
                [.control, .shift, .alternate, .command],
            )
            let signature = "\(input.lowercased())|\(relevant.rawValue)"
            guard !hardwareKeyboard.recentKeyCommandDeliveries.contains(signature) else {
                TerminalDebugLog.log(
                    .input,
                    "uikit key delivery deduped signature=\(signature)",
                )
                return false
            }
            hardwareKeyboard.recentKeyCommandDeliveries.insert(signature)
            DispatchQueue.main.async { [weak self] in
                self?.hardwareKeyboard.recentKeyCommandDeliveries.remove(signature)
            }
            return true
        }
    }
#endif
