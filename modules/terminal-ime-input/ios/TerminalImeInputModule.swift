import ExpoModulesCore
import UIKit

private final class TerminalImeTextView: UITextView, UITextViewDelegate {
  var onCommitText: ((String) -> Void)?
  var onSpecialKey: ((String, Bool, Bool, Bool) -> Void)?
  var onCompositionStateChange: ((Bool) -> Void)?
  var onFocus: (() -> Void)?
  var onBlur: (() -> Void)?

  private var isResettingText = false
  private var lastCompositionState = false

  override init(frame: CGRect, textContainer: NSTextContainer?) {
    super.init(frame: frame, textContainer: textContainer)

    delegate = self
    autocorrectionType = .no
    autocapitalizationType = .none
    spellCheckingType = .no
    smartInsertDeleteType = .no
    if #available(iOS 11.0, *) {
      smartQuotesType = .no
      smartDashesType = .no
    }
    backgroundColor = .clear
    textColor = .clear
    tintColor = .clear
    isOpaque = false
    isScrollEnabled = false
    textContainerInset = .zero
    textContainer?.lineFragmentPadding = 0
    keyboardDismissMode = .none
    returnKeyType = .default
    inputAssistantItem.leadingBarButtonGroups = []
    inputAssistantItem.trailingBarButtonGroups = []
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var canBecomeFirstResponder: Bool {
    true
  }

  func focusInput() {
    _ = becomeFirstResponder()
  }

  func blurInput() {
    _ = resignFirstResponder()
    clearInput()
  }

  func clearInput() {
    isResettingText = true
    text = ""
    if markedTextRange != nil {
      unmarkText()
    }
    selectedRange = NSRange(location: 0, length: 0)

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.isResettingText = false
      self.emitCompositionStateIfNeeded(force: true)
    }
  }

  func textViewDidBeginEditing(_ textView: UITextView) {
    onFocus?()
  }

  func textViewDidEndEditing(_ textView: UITextView) {
    onBlur?()
  }

  func textViewDidChange(_ textView: UITextView) {
    emitCompositionStateIfNeeded()

    if isResettingText {
      return
    }

    if markedTextRange != nil {
      return
    }

    let committedText = textView.text ?? ""
    guard !committedText.isEmpty else { return }

    onCommitText?(committedText)
    clearInput()
  }

  func textViewDidChangeSelection(_ textView: UITextView) {
    emitCompositionStateIfNeeded()
  }

  func textView(
    _ textView: UITextView,
    shouldChangeTextIn range: NSRange,
    replacementText text: String
  ) -> Bool {
    let isComposing = markedTextRange != nil
    if text == "\n" && !isComposing {
      onSpecialKey?("Enter", false, false, false)
      clearInput()
      return false
    }

    return true
  }

  override func deleteBackward() {
    let isComposing = markedTextRange != nil
    let hasCommittedBuffer = !(text?.isEmpty ?? true)

    if !isComposing && !hasCommittedBuffer {
      onSpecialKey?("Backspace", false, false, false)
      return
    }

    super.deleteBackward()
    emitCompositionStateIfNeeded()
  }

  private func emitCompositionStateIfNeeded(force: Bool = false) {
    let isActive = markedTextRange != nil
    if force || isActive != lastCompositionState {
      lastCompositionState = isActive
      onCompositionStateChange?(isActive)
    }
  }
}

final class TerminalImeInputView: ExpoView {
  let onCommitText = EventDispatcher()
  let onSpecialKey = EventDispatcher()
  let onCompositionStateChange = EventDispatcher()
  let onFocus = EventDispatcher()
  let onBlur = EventDispatcher()

  private let textView = TerminalImeTextView(frame: .zero)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    backgroundColor = .clear
    clipsToBounds = false

    textView.onCommitText = { [weak self] text in
      self?.onCommitText(["text": text])
    }
    textView.onSpecialKey = { [weak self] key, shift, ctrl, alt in
      self?.onSpecialKey([
        "key": key,
        "shift": shift,
        "ctrl": ctrl,
        "alt": alt,
        "source": "native-ime",
      ])
    }
    textView.onCompositionStateChange = { [weak self] active in
      self?.onCompositionStateChange(["active": active])
    }
    textView.onFocus = { [weak self] in
      self?.onFocus([:])
    }
    textView.onBlur = { [weak self] in
      self?.onBlur([:])
    }

    addSubview(textView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    textView.frame = bounds
  }

  func focusInput() {
    textView.focusInput()
  }

  func blurInput() {
    textView.blurInput()
  }

  func clearInput() {
    textView.clearInput()
  }
}

public final class TerminalImeInputModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TerminalImeInput")

    View(TerminalImeInputView.self) {
      Events(
        "onCommitText",
        "onSpecialKey",
        "onCompositionStateChange",
        "onFocus",
        "onBlur"
      )

      AsyncFunction("focus") { (view: TerminalImeInputView) in
        view.focusInput()
      }

      AsyncFunction("blur") { (view: TerminalImeInputView) in
        view.blurInput()
      }

      AsyncFunction("clear") { (view: TerminalImeInputView) in
        view.clearInput()
      }
    }
  }
}
