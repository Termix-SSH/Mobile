package expo.modules.termixterminal

import android.view.KeyEvent

// App shortcuts on hardware keyboards. Ctrl+Shift keeps them clear of what
// shells use; the ids match src/features/terminal/shortcuts.ts.
internal object Shortcuts {
  fun idFor(event: KeyEvent): String? {
    if (event.action != KeyEvent.ACTION_DOWN || event.repeatCount > 0) return null
    val ctrl = event.isCtrlPressed
    val shift = event.isShiftPressed
    if (ctrl && event.keyCode == KeyEvent.KEYCODE_TAB) return if (shift) "prevTab" else "nextTab"
    if (ctrl && !shift) {
      return when (event.keyCode) {
        KeyEvent.KEYCODE_PAGE_DOWN -> "nextTab"
        KeyEvent.KEYCODE_PAGE_UP -> "prevTab"
        KeyEvent.KEYCODE_EQUALS, KeyEvent.KEYCODE_PLUS, KeyEvent.KEYCODE_NUMPAD_ADD -> "fontBigger"
        KeyEvent.KEYCODE_MINUS, KeyEvent.KEYCODE_NUMPAD_SUBTRACT -> "fontSmaller"
        KeyEvent.KEYCODE_0 -> "fontReset"
        else -> null
      }
    }
    if (!ctrl || !shift) return null
    return when (event.keyCode) {
      KeyEvent.KEYCODE_T -> "newTab"
      KeyEvent.KEYCODE_W -> "closeTab"
      KeyEvent.KEYCODE_F -> "find"
      KeyEvent.KEYCODE_EQUALS, KeyEvent.KEYCODE_PLUS -> "fontBigger"
      in KeyEvent.KEYCODE_1..KeyEvent.KEYCODE_9 -> "tab${event.keyCode - KeyEvent.KEYCODE_0}"
      else -> null
    }
  }
}
