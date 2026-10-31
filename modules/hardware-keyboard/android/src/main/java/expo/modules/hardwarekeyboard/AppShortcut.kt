package expo.modules.hardwarekeyboard

import android.view.KeyEvent

/** One app wide shortcut from JS: a key plus the modifiers that must be down. */
data class AppShortcut(
  val id: String,
  val key: Char,
  val ctrl: Boolean,
  val shift: Boolean,
  val alt: Boolean,
  val meta: Boolean
) {
  /** True when a key press is exactly this key and modifier set. */
  fun matches(event: KeyEvent): Boolean {
    val pressed = event.getUnicodeChar(0)
    if (pressed == 0 || pressed.toChar().lowercaseChar() != key) return false
    return event.isCtrlPressed == ctrl &&
      event.isShiftPressed == shift &&
      event.isAltPressed == alt &&
      event.isMetaPressed == meta
  }

  companion object {
    /** Reads one item sent by `setAppShortcuts`. Bad items are skipped. */
    fun from(item: Map<String, Any?>): AppShortcut? {
      val id = item["id"] as? String ?: return null
      val input = (item["input"] as? String)?.singleOrNull() ?: return null
      val modifiers = (item["modifiers"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
      return AppShortcut(
        id = id,
        key = input.lowercaseChar(),
        ctrl = "ctrl" in modifiers,
        shift = "shift" in modifiers,
        alt = "alt" in modifiers,
        meta = "cmd" in modifiers
      )
    }
  }
}
