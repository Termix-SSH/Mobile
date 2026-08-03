package expo.modules.terminalimeinput

import android.content.Context
import android.graphics.Color
import android.text.InputType
import android.view.KeyEvent
import android.view.View.OnFocusChangeListener
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

private class TerminalImeEditText(
  context: Context,
  private val owner: TerminalImeInputView,
) : EditText(context) {
  init {
    setBackgroundColor(Color.TRANSPARENT)
    setTextColor(Color.TRANSPARENT)
    highlightColor = Color.TRANSPARENT
    isCursorVisible = false
    isFocusable = true
    isFocusableInTouchMode = true
    setSingleLine(false)
    imeOptions = EditorInfo.IME_ACTION_NONE or EditorInfo.IME_FLAG_NO_EXTRACT_UI
    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
    setPadding(0, 0, 0, 0)
  }

  override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
    val base = super.onCreateInputConnection(outAttrs) ?: return null
    outAttrs.imeOptions = outAttrs.imeOptions or EditorInfo.IME_FLAG_NO_EXTRACT_UI
    return TerminalImeInputConnection(this, base)
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    val mappedKey = mapSpecialKey(keyCode) ?: return super.onKeyDown(keyCode, event)
    if (owner.isCompositionActive()) {
      return super.onKeyDown(keyCode, event)
    }

    owner.emitSpecialKey(
      key = mappedKey,
      shift = event.isShiftPressed,
      ctrl = event.isCtrlPressed,
      alt = event.isAltPressed,
    )

    if (mappedKey == "Enter") {
      clearInputState()
    }

    return true
  }

  fun focusInput() {
    requestFocus()
    post {
      val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
      imm?.showSoftInput(this, InputMethodManager.SHOW_IMPLICIT)
    }
  }

  fun blurInput() {
    clearFocus()
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    imm?.hideSoftInputFromWindow(windowToken, 0)
    clearInputState()
  }

  fun clearInputState() {
    setText("")
    setSelection(text?.length ?: 0)
    owner.setCompositionActive(false)
  }

  fun onCommittedText(text: CharSequence?) {
    if (text.isNullOrEmpty()) {
      return
    }

    owner.emitCommittedText(text.toString())
    clearInputState()
  }

  fun onCompositionTextChanged(active: Boolean) {
    owner.setCompositionActive(active)
  }

  fun onDeleteFromIme(): Boolean {
    if (owner.isCompositionActive()) {
      return false
    }

    if (!text.isNullOrEmpty()) {
      return false
    }

    owner.emitSpecialKey("Backspace")
    return true
  }

  fun onEnterFromIme(): Boolean {
    if (owner.isCompositionActive()) {
      return false
    }

    owner.emitSpecialKey("Enter")
    clearInputState()
    return true
  }

  private fun mapSpecialKey(keyCode: Int): String? = when (keyCode) {
    KeyEvent.KEYCODE_ENTER,
    KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
    KeyEvent.KEYCODE_DEL -> "Backspace"
    KeyEvent.KEYCODE_FORWARD_DEL -> "Delete"
    KeyEvent.KEYCODE_TAB -> "Tab"
    KeyEvent.KEYCODE_ESCAPE -> "Escape"
    KeyEvent.KEYCODE_MOVE_HOME -> "Home"
    KeyEvent.KEYCODE_MOVE_END -> "End"
    KeyEvent.KEYCODE_PAGE_UP -> "PageUp"
    KeyEvent.KEYCODE_PAGE_DOWN -> "PageDown"
    KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
    KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
    KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
    KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
    KeyEvent.KEYCODE_F1 -> "F1"
    KeyEvent.KEYCODE_F2 -> "F2"
    KeyEvent.KEYCODE_F3 -> "F3"
    KeyEvent.KEYCODE_F4 -> "F4"
    KeyEvent.KEYCODE_F5 -> "F5"
    KeyEvent.KEYCODE_F6 -> "F6"
    KeyEvent.KEYCODE_F7 -> "F7"
    KeyEvent.KEYCODE_F8 -> "F8"
    KeyEvent.KEYCODE_F9 -> "F9"
    KeyEvent.KEYCODE_F10 -> "F10"
    KeyEvent.KEYCODE_F11 -> "F11"
    KeyEvent.KEYCODE_F12 -> "F12"
    else -> null
  }

  private class TerminalImeInputConnection(
    private val editText: TerminalImeEditText,
    target: InputConnection,
  ) : InputConnectionWrapper(target, true) {
    override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean {
      editText.onCompositionTextChanged(true)
      return super.setComposingText(text, newCursorPosition)
    }

    override fun setComposingRegion(start: Int, end: Int): Boolean {
      editText.onCompositionTextChanged(start != end)
      return super.setComposingRegion(start, end)
    }

    override fun finishComposingText(): Boolean {
      editText.onCompositionTextChanged(false)
      return super.finishComposingText()
    }

    override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean {
      val committed = text?.toString().orEmpty()
      if (committed == "\n" && editText.onEnterFromIme()) {
        return true
      }

      val result = super.commitText(text, newCursorPosition)
      editText.onCompositionTextChanged(false)
      if (committed.isNotEmpty()) {
        editText.onCommittedText(committed)
      }
      return result
    }

    override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
      if (beforeLength > 0 && afterLength == 0 && editText.onDeleteFromIme()) {
        return true
      }
      return super.deleteSurroundingText(beforeLength, afterLength)
    }

    override fun deleteSurroundingTextInCodePoints(
      beforeLength: Int,
      afterLength: Int,
    ): Boolean {
      if (beforeLength > 0 && afterLength == 0 && editText.onDeleteFromIme()) {
        return true
      }
      return super.deleteSurroundingTextInCodePoints(beforeLength, afterLength)
    }
  }
}

class TerminalImeInputView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext) {
  val onCommitText by EventDispatcher()
  val onSpecialKey by EventDispatcher()
  val onCompositionStateChange by EventDispatcher()
  val onFocus by EventDispatcher()
  val onBlur by EventDispatcher()

  private val inputView = TerminalImeEditText(context, this)
  private var compositionActive = false

  init {
    setBackgroundColor(Color.TRANSPARENT)
    inputView.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
    )
    inputView.onFocusChangeListener = OnFocusChangeListener { _, hasFocus ->
      if (hasFocus) {
        onFocus(mapOf<String, Any>())
      } else {
        onBlur(mapOf<String, Any>())
      }
    }
    addView(inputView)
  }

  fun focusInput() {
    inputView.focusInput()
  }

  fun blurInput() {
    inputView.blurInput()
  }

  fun clearInput() {
    inputView.clearInputState()
  }

  internal fun emitCommittedText(text: String) {
    onCommitText(mapOf("text" to text))
  }

  internal fun emitSpecialKey(
    key: String,
    shift: Boolean = false,
    ctrl: Boolean = false,
    alt: Boolean = false,
  ) {
    onSpecialKey(
      mapOf(
        "key" to key,
        "shift" to shift,
        "ctrl" to ctrl,
        "alt" to alt,
        "source" to "native-ime",
      )
    )
  }

  internal fun setCompositionActive(active: Boolean) {
    if (compositionActive == active) {
      return
    }
    compositionActive = active
    onCompositionStateChange(mapOf("active" to active))
  }

  internal fun isCompositionActive(): Boolean = compositionActive
}

class TerminalImeInputModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TerminalImeInput")

    View(TerminalImeInputView::class) {
      Events(
        "onCommitText",
        "onSpecialKey",
        "onCompositionStateChange",
        "onFocus",
        "onBlur"
      )

      AsyncFunction("focus") { view: TerminalImeInputView ->
        view.focusInput()
      }

      AsyncFunction("blur") { view: TerminalImeInputView ->
        view.blurInput()
      }

      AsyncFunction("clear") { view: TerminalImeInputView ->
        view.clearInput()
      }
    }
  }
}
