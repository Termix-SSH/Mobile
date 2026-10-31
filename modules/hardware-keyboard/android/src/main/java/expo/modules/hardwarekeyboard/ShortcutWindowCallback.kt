package expo.modules.hardwarekeyboard

import android.view.KeyEvent
import android.view.Window

/**
 * Sits in front of the activity's own window callback and takes the key
 * presses that are app shortcuts. Everything else, including every key the
 * terminal reads, goes on to the original callback untouched.
 */
class ShortcutWindowCallback(
  private val base: Window.Callback,
  private val onKey: (KeyEvent) -> Boolean
) : Window.Callback by base {
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0 && onKey(event)) {
      return true
    }
    return base.dispatchKeyEvent(event)
  }

  /** The callback this one wraps, to put back when the module goes away. */
  fun original(): Window.Callback = base
}
