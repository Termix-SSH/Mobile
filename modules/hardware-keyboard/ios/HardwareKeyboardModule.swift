import ExpoModulesCore
import UIKit

public class HardwareKeyboardModule: Module {
  private static var swizzled = false
  private static var instances: [ObjectIdentifier: HardwareKeyboardModule] = [:]
  private static var lastEmit: (input: String, shift: Bool, ctrl: Bool, alt: Bool, time: TimeInterval)?

  public func definition() -> ModuleDefinition {
    Name("HardwareKeyboard")

    Events("onKeyCommand")

    OnCreate {
      // Register immediately on creation, not waiting for a listener
      HardwareKeyboardModule.instances[ObjectIdentifier(self)] = self
      HardwareKeyboardModule.swizzleIfNeeded()
    }

    OnDestroy {
      HardwareKeyboardModule.instances.removeValue(forKey: ObjectIdentifier(self))
    }
  }

  static func swizzleIfNeeded() {
    guard !swizzled else { return }
    swizzled = true

    if
      let original = class_getInstanceMethod(
        UIViewController.self,
        #selector(getter: UIViewController.keyCommands)
      ),
      let replacement = class_getInstanceMethod(
        UIViewController.self,
        #selector(UIViewController.hk_keyCommands)
      )
    {
      method_exchangeImplementations(original, replacement)
    }

    if
      let original = class_getInstanceMethod(
        UIResponder.self,
        #selector(UIResponder.pressesBegan(_:with:))
      ),
      let replacement = class_getInstanceMethod(
        UIResponder.self,
        #selector(UIResponder.hk_pressesBegan(_:with:))
      )
    {
      method_exchangeImplementations(original, replacement)
    }
  }

  static func emitToAll(_ input: String, shift: Bool, ctrl: Bool = false, alt: Bool = false) {
    let now = Date().timeIntervalSince1970
    if let last = lastEmit,
       last.input == input,
       last.shift == shift,
       last.ctrl == ctrl,
       last.alt == alt,
       now - last.time < 0.03
    {
      return
    }
    lastEmit = (input, shift, ctrl, alt, now)

    let payload: [String: Any] = ["input": input, "shift": shift, "ctrl": ctrl, "alt": alt]
    for instance in instances.values {
      instance.sendEvent("onKeyCommand", payload)
    }
  }
}

extension UIResponder {
  @objc func hk_pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    let handled = presses.contains { press in
      guard press.type == .keyboard, let key = press.key else { return false }

      let modifiers = key.modifierFlags
      let shift = modifiers.contains(.shift)
      let ctrl = modifiers.contains(.control)
      let alt = modifiers.contains(.alternate)

      switch key.keyCode {
      case .keyboardTab:
        HardwareKeyboardModule.emitToAll("\t", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardUpArrow:
        HardwareKeyboardModule.emitToAll("ArrowUp", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardDownArrow:
        HardwareKeyboardModule.emitToAll("ArrowDown", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardLeftArrow:
        HardwareKeyboardModule.emitToAll("ArrowLeft", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardRightArrow:
        HardwareKeyboardModule.emitToAll("ArrowRight", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardEscape:
        HardwareKeyboardModule.emitToAll("Escape", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardDeleteOrBackspace:
        HardwareKeyboardModule.emitToAll("Backspace", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardDeleteForward:
        HardwareKeyboardModule.emitToAll("Delete", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardHome:
        HardwareKeyboardModule.emitToAll("Home", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardEnd:
        HardwareKeyboardModule.emitToAll("End", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardPageUp:
        HardwareKeyboardModule.emitToAll("PageUp", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardPageDown:
        HardwareKeyboardModule.emitToAll("PageDown", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF1:
        HardwareKeyboardModule.emitToAll("F1", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF2:
        HardwareKeyboardModule.emitToAll("F2", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF3:
        HardwareKeyboardModule.emitToAll("F3", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF4:
        HardwareKeyboardModule.emitToAll("F4", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF5:
        HardwareKeyboardModule.emitToAll("F5", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF6:
        HardwareKeyboardModule.emitToAll("F6", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF7:
        HardwareKeyboardModule.emitToAll("F7", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF8:
        HardwareKeyboardModule.emitToAll("F8", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF9:
        HardwareKeyboardModule.emitToAll("F9", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF10:
        HardwareKeyboardModule.emitToAll("F10", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF11:
        HardwareKeyboardModule.emitToAll("F11", shift: shift, ctrl: ctrl, alt: alt)
        return true
      case .keyboardF12:
        HardwareKeyboardModule.emitToAll("F12", shift: shift, ctrl: ctrl, alt: alt)
        return true
      default:
        if let input = key.charactersIgnoringModifiers, input.count == 1 {
          if ctrl {
            HardwareKeyboardModule.emitToAll(input, shift: shift, ctrl: true, alt: alt)
            return true
          }
          if alt && !ctrl {
            HardwareKeyboardModule.emitToAll(input, shift: shift, ctrl: false, alt: true)
            return true
          }
        }
        return false
      }
    }

    if !handled {
      self.hk_pressesBegan(presses, with: event)
    }
  }
}

extension UIViewController {
  @objc func hk_keyCommands() -> [UIKeyCommand]? {
    var commands = self.hk_keyCommands() ?? []

    // Shift+Tab
    let shiftTab = UIKeyCommand(input: "\t", modifierFlags: .shift, action: #selector(hk_handleShiftTab))
    shiftTab.wantsPriorityOverSystemBehavior = true
    commands.append(shiftTab)

    // Tab (unmodified)
    let tab = UIKeyCommand(input: "\t", modifierFlags: [], action: #selector(hk_handleTab))
    tab.wantsPriorityOverSystemBehavior = true
    commands.append(tab)

    // Arrow keys (plain and with Shift)
    for (input, plainSel, shiftSel) in [
      (UIKeyCommand.inputUpArrow,    #selector(hk_handleArrowUp(_:)),    #selector(hk_handleShiftArrowUp(_:))),
      (UIKeyCommand.inputDownArrow,  #selector(hk_handleArrowDown(_:)),  #selector(hk_handleShiftArrowDown(_:))),
      (UIKeyCommand.inputLeftArrow,  #selector(hk_handleArrowLeft(_:)),  #selector(hk_handleShiftArrowLeft(_:))),
      (UIKeyCommand.inputRightArrow, #selector(hk_handleArrowRight(_:)), #selector(hk_handleShiftArrowRight(_:))),
    ] as [(String, Selector, Selector)] {
      let plain = UIKeyCommand(input: input, modifierFlags: [], action: plainSel)
      plain.wantsPriorityOverSystemBehavior = true
      commands.append(plain)

      let shifted = UIKeyCommand(input: input, modifierFlags: .shift, action: shiftSel)
      shifted.wantsPriorityOverSystemBehavior = true
      commands.append(shifted)
    }

    // Escape
    let esc = UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(hk_handleEscape))
    esc.wantsPriorityOverSystemBehavior = true
    commands.append(esc)

    // Ctrl key combinations
    let ctrlInputs = [
      "a","b","c","d","e","f","g","h","k","l","n","p","q","r","s","t","u","v","w","x","y","z",
      "[","]","\\",
    ]
    for input in ctrlInputs {
      let cmd = UIKeyCommand(input: input, modifierFlags: .control, action: #selector(hk_handleCtrlKey(_:)))
      cmd.wantsPriorityOverSystemBehavior = true
      commands.append(cmd)
    }

    return commands
  }

  @objc func hk_handleTab()         { HardwareKeyboardModule.emitToAll("\t",         shift: false) }
  @objc func hk_handleShiftTab()   { HardwareKeyboardModule.emitToAll("\t",         shift: true) }
  @objc func hk_handleEscape()     { HardwareKeyboardModule.emitToAll("Escape",     shift: false) }

  @objc func hk_handleArrowUp(_ sender: UIKeyCommand)    { HardwareKeyboardModule.emitToAll("ArrowUp",    shift: sender.modifierFlags.contains(.shift)) }
  @objc func hk_handleArrowDown(_ sender: UIKeyCommand)  { HardwareKeyboardModule.emitToAll("ArrowDown",  shift: sender.modifierFlags.contains(.shift)) }
  @objc func hk_handleArrowLeft(_ sender: UIKeyCommand)  { HardwareKeyboardModule.emitToAll("ArrowLeft",  shift: sender.modifierFlags.contains(.shift)) }
  @objc func hk_handleArrowRight(_ sender: UIKeyCommand) { HardwareKeyboardModule.emitToAll("ArrowRight", shift: sender.modifierFlags.contains(.shift)) }

  @objc func hk_handleShiftArrowUp(_ sender: UIKeyCommand)    { HardwareKeyboardModule.emitToAll("ArrowUp",    shift: true) }
  @objc func hk_handleShiftArrowDown(_ sender: UIKeyCommand)  { HardwareKeyboardModule.emitToAll("ArrowDown",  shift: true) }
  @objc func hk_handleShiftArrowLeft(_ sender: UIKeyCommand)  { HardwareKeyboardModule.emitToAll("ArrowLeft",  shift: true) }
  @objc func hk_handleShiftArrowRight(_ sender: UIKeyCommand) { HardwareKeyboardModule.emitToAll("ArrowRight", shift: true) }

  @objc func hk_handleCtrlKey(_ sender: UIKeyCommand) {
    guard let input = sender.input else { return }
    HardwareKeyboardModule.emitToAll(input, shift: false, ctrl: true)
  }
}
