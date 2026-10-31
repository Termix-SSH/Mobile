package expo.modules.hardwarekeyboard

import android.view.KeyEvent
import android.view.Window
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * App wide keyboard shortcuts on Android. The xterm fallback capture
 * (`setEnabled`) is iOS only, the native terminal reads its own keys here.
 */
class HardwareKeyboardModule : Module() {
  @Volatile
  private var shortcuts: List<AppShortcut> = emptyList()
  private var window: Window? = null

  override fun definition() = ModuleDefinition {
    Name("HardwareKeyboard")

    Events("onKeyCommand", "onAppShortcut")

    Function("setAppShortcuts") { items: List<Map<String, Any?>> ->
      shortcuts = items.mapNotNull(AppShortcut::from)
      install()
    }

    OnActivityEntersForeground { install() }

    OnActivityDestroys { uninstall() }

    OnDestroy { uninstall() }
  }

  private fun handle(event: KeyEvent): Boolean {
    val match = shortcuts.firstOrNull { it.matches(event) } ?: return false
    sendEvent("onAppShortcut", mapOf("id" to match.id))
    return true
  }

  private fun install() {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread {
      val target = activity.window
      val current = target.callback ?: return@runOnUiThread
      if (current is ShortcutWindowCallback) return@runOnUiThread
      target.callback = ShortcutWindowCallback(current, ::handle)
      window = target
    }
  }

  private fun uninstall() {
    val target = window ?: return
    window = null
    val current = target.callback
    if (current is ShortcutWindowCallback) target.callback = current.original()
  }
}
