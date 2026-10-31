package expo.modules.termixterminal

import android.content.Context
import android.util.Base64
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

// Ghostty terminal view. Output comes from a native pipe (local SSH) or from
// write; typed bytes and terminal replies go out through onInput. The app draws
// its own key row.
class TermixTerminalView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {
  private val onInput by EventDispatcher<Map<String, Any>>()
  private val onResize by EventDispatcher<Map<String, Any>>()
  private val onBell by EventDispatcher<Map<String, Any>>()
  private val onTitleChange by EventDispatcher<Map<String, Any>>()
  private val onScrollState by EventDispatcher<Map<String, Any>>()
  private val onLink by EventDispatcher<Map<String, Any>>()
  private val onCopy by EventDispatcher<Map<String, Any>>()
  private val onClipboardRequest by EventDispatcher<Map<String, Any>>()
  private val onFontSize by EventDispatcher<Map<String, Any>>()
  private val onModifiers by EventDispatcher<Map<String, Any>>()
  private val onPromptLine by EventDispatcher<Map<String, Any>>()
  private val onSearch by EventDispatcher<Map<String, Any>>()
  private val onMenu by EventDispatcher<Map<String, Any>>()
  private val onShortcut by EventDispatcher<Map<String, Any>>()

  private val terminal = GhosttyTerminalView(context).also { view ->
    view.onInputBytes = { bytes ->
      onInput(mapOf("data" to Base64.encodeToString(bytes, Base64.NO_WRAP)))
    }
    view.onGridResize = { cols, rows -> onResize(mapOf("cols" to cols, "rows" to rows)) }
    view.onBell = { onBell(emptyMap()) }
    view.onTitleChange = { title -> onTitleChange(mapOf("title" to title)) }
    view.onScrollState = { atBottom -> onScrollState(mapOf("atBottom" to atBottom)) }
    view.onLink = { url -> onLink(mapOf("url" to url)) }
    view.onCopied = { text, fromProgram -> onCopy(mapOf("text" to text, "fromProgram" to fromProgram)) }
    view.onPasteRequest = { id, text ->
      onClipboardRequest(mapOf("id" to id, "kind" to "paste", "text" to text))
    }
    view.onFontSizeChange = { size -> onFontSize(mapOf("size" to size)) }
    view.onModifiers = { ctrl, alt -> onModifiers(mapOf("ctrl" to ctrl, "alt" to alt)) }
    view.onPromptLine = { line -> onPromptLine(mapOf("line" to line)) }
    view.onSearch = { total, index -> onSearch(mapOf("total" to total, "index" to index)) }
    view.onMenu = { onMenu(emptyMap()) }
    view.onShortcut = { id -> onShortcut(mapOf("id" to id)) }
  }

  init {
    addView(terminal, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setPipe(id: String?) = terminal.setPipe(id)

  fun setFontSize(dp: Float) = terminal.setFontSize(dp)

  fun setFontFamily(family: String?) = terminal.setFontFamily(family)

  fun setLineHeight(value: Float) = terminal.setLineHeight(value)

  fun setLetterSpacing(value: Float) = terminal.setLetterSpacing(value)

  fun setCursor(style: String?, blink: Boolean) = terminal.setCursor(style, blink)

  fun setScrollback(lines: Int) = terminal.setScrollback(lines)

  fun setBell(style: String?, haptics: Boolean) = terminal.setBell(style, haptics)

  fun setAccentColor(color: String?) = terminal.setHandleColor(color)

  fun setPromptWatch(on: Boolean) {
    terminal.promptWatch = on
  }

  internal fun setTheme(theme: TerminalThemeRecord?) = terminal.setTheme(
    foreground = theme?.foreground,
    background = theme?.background,
    cursorColor = theme?.cursorColor,
    cursorAccent = theme?.cursorAccent,
    selectionBackground = theme?.selectionBackground,
    selectionForeground = theme?.selectionForeground,
    palette = theme?.palette?.toTypedArray()
  )

  fun write(data: ByteArray) = terminal.write(data)

  fun paste(text: String) = terminal.pasteText(text)

  fun scrollToBottom() = terminal.scrollToBottom()

  fun copySelection() = terminal.copySelectionToClipboard()

  fun selectAll() = terminal.selectAll()

  fun search(query: String, caseSensitive: Boolean, wholeWord: Boolean, regex: Boolean) =
    terminal.search(query, caseSensitive, wholeWord, regex)

  fun searchStep(forward: Boolean) = terminal.searchStep(forward)

  fun clearSearch() = terminal.clearSearch()

  fun focusTerminal() = terminal.showKeyboard()

  fun blurTerminal() = terminal.hideKeyboard()

  fun toggleModifier(name: String) = terminal.toggleModifier(name)

  fun sendKey(name: String, shift: Boolean) = terminal.sendNamedKey(name, shift)

  fun typeText(text: String) = terminal.typeText(text)

  fun answerClipboard(id: Int, allow: Boolean) = terminal.answerPaste(id, allow)

  fun stats(): Map<String, Any> = terminal.stats.snapshot()

  internal fun destroy() = terminal.destroy()
}
