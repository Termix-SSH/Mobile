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
      default:
        if ctrl, let input = key.charactersIgnoringModifiers, input.count == 1 {
          HardwareKeyboardModule.emitToAll(input, shift: shift, ctrl: true, alt: alt)
          return true
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

    // Arrow keys
    let upCmd = UIKeyCommand(input: UIKeyCommand.inputUpArrow, modifierFlags: [], action: #selector(hk_handleArrowUp))
    upCmd.wantsPriorityOverSystemBehavior = true
    commands.append(upCmd)

    let downCmd = UIKeyCommand(input: UIKeyCommand.inputDownArrow, modifierFlags: [], action: #selector(hk_handleArrowDown))
    downCmd.wantsPriorityOverSystemBehavior = true
    commands.append(downCmd)

    let leftCmd = UIKeyCommand(input: UIKeyCommand.inputLeftArrow, modifierFlags: [], action: #selector(hk_handleArrowLeft))
    leftCmd.wantsPriorityOverSystemBehavior = true
    commands.append(leftCmd)

    let rightCmd = UIKeyCommand(input: UIKeyCommand.inputRightArrow, modifierFlags: [], action: #selector(hk_handleArrowRight))
    rightCmd.wantsPriorityOverSystemBehavior = true
    commands.append(rightCmd)

    // Tab (unmodified)
    let tab = UIKeyCommand(input: "\t", modifierFlags: [], action: #selector(hk_handleTab))
    tab.wantsPriorityOverSystemBehavior = true
    commands.append(tab)

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
  @objc func hk_handleArrowUp()    { HardwareKeyboardModule.emitToAll("ArrowUp",    shift: false) }
  @objc func hk_handleArrowDown()  { HardwareKeyboardModule.emitToAll("ArrowDown",  shift: false) }
  @objc func hk_handleArrowLeft()  { HardwareKeyboardModule.emitToAll("ArrowLeft",  shift: false) }
  @objc func hk_handleArrowRight() { HardwareKeyboardModule.emitToAll("ArrowRight", shift: false) }
  @objc func hk_handleEscape()     { HardwareKeyboardModule.emitToAll("Escape",     shift: false) }

  @objc func hk_handleCtrlKey(_ sender: UIKeyCommand) {
    guard let input = sender.input else { return }
    HardwareKeyboardModule.emitToAll(input, shift: false, ctrl: true)
  }
}
