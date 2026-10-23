package expo.modules.termixterminalghostty

import android.content.Context
import android.util.Base64
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

// Ghostty terminal view. JS owns the transport; this view renders bytes pushed
// through write and reports input and grid size back. The app draws its own
// accessory row, so the vendored one is left out.
class TermixGhosttyView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {
  private val onInput by EventDispatcher<Map<String, Any>>()
  private val onResize by EventDispatcher<Map<String, Any>>()
  private val onBell by EventDispatcher<Map<String, Any>>()
  private val onTitleChange by EventDispatcher<Map<String, Any>>()

  private val terminal = GhosttyTerminalView(context).also { view ->
    view.onInputBytes = { bytes ->
      onInput(mapOf("data" to Base64.encodeToString(bytes, Base64.NO_WRAP)))
    }
    view.onGridResize = { cols, rows -> onResize(mapOf("cols" to cols, "rows" to rows)) }
    view.onBell = { onBell(emptyMap()) }
    view.onTitleChange = { title -> onTitleChange(mapOf("title" to title)) }
  }

  init {
    addView(terminal, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setFontSize(dp: Float) = terminal.setFontSize(dp)

  internal fun setTheme(theme: TerminalThemeRecord?) = terminal.setTheme(
    foreground = theme?.foreground,
    background = theme?.background,
    cursorColor = theme?.cursorColor,
    selectionBackground = theme?.selectionBackground,
    selectionForeground = theme?.selectionForeground,
    palette = theme?.palette?.toTypedArray()
  )

  fun write(data: ByteArray) = terminal.write(data)

  fun paste(text: String) = terminal.pasteText(text)

  fun scrollToBottom() = terminal.scrollToBottom()

  fun copySelection() = terminal.copySelectionToClipboard()

  fun focusTerminal() = terminal.showKeyboard()

  fun blurTerminal() = terminal.hideKeyboard()

  fun stats(): Map<String, Any> = terminal.stats.snapshot()

  internal fun destroy() = terminal.destroy()
}
