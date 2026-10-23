package expo.modules.termixterminalnative

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.util.Base64
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.inputmethod.InputMethodManager
import com.facebook.react.common.assets.ReactFontManager
import com.termux.terminal.TerminalColors
import com.termux.terminal.TerminalSession
import com.termux.terminal.TerminalSessionClient
import com.termux.view.TerminalView
import com.termux.view.TerminalViewClient
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.Properties

/** Termux view that times each draw for the lab readout. */
internal class TimedTerminalView(context: Context) : TerminalView(context, null) {
  val stats = RenderStats()

  override fun onDraw(canvas: Canvas) {
    val start = System.nanoTime()
    super.onDraw(canvas)
    stats.recordRender(System.nanoTime() - start)
  }
}

// Termux terminal-view fed from JS. Output arrives through write, key input
// leaves through onInput.
class TermixTermuxView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {
  private val onInput by EventDispatcher<Map<String, Any>>()
  private val onResize by EventDispatcher<Map<String, Any>>()
  private val onBell by EventDispatcher<Map<String, Any>>()
  private val onTitleChange by EventDispatcher<Map<String, Any>>()

  private val density = resources.displayMetrics.density
  private var fontSizeDp = 14f
  private val view = TimedTerminalView(context)

  private val session = TerminalSession(
    TRANSCRIPT_ROWS,
    SessionClient(),
    object : TerminalSession.Sink {
      override fun onInput(data: ByteArray, offset: Int, count: Int) {
        onInput(mapOf("data" to Base64.encodeToString(data, offset, count, Base64.NO_WRAP)))
      }

      override fun onResize(columns: Int, rows: Int) {
        onResize(mapOf("cols" to columns, "rows" to rows))
      }
    }
  )

  init {
    view.setTerminalViewClient(ViewClient())
    view.setTextSize((fontSizeDp * density).toInt())
    view.setTypeface(appFont())
    view.isFocusable = true
    view.isFocusableInTouchMode = true
    view.contentDescription = "Terminal"
    view.attachSession(session)
    addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  // The app embeds CaskaydiaCove with the expo-font config plugin, which
  // registers it with React Native's font manager. Termux draws bold and
  // italic from this one face.
  private fun appFont(): Typeface = try {
    ReactFontManager.getInstance().getTypeface("CaskaydiaCove NFM", Typeface.NORMAL, context.assets)
  } catch (e: RuntimeException) {
    Typeface.MONOSPACE
  }

  fun setFontSize(dp: Float) {
    val clamped = dp.coerceIn(MIN_FONT_DP, MAX_FONT_DP)
    if (clamped == fontSizeDp) return
    fontSizeDp = clamped
    view.setTextSize((clamped * density).toInt())
  }

  internal fun setTheme(theme: NativeThemeRecord?) {
    val props = Properties()
    theme?.foreground?.let { props["foreground"] = it }
    theme?.background?.let { props["background"] = it }
    theme?.cursorColor?.let { props["cursor"] = it }
    theme?.palette?.forEachIndexed { i, c -> if (c != null && i < 16) props["color$i"] = c }
    try {
      TerminalColors.COLOR_SCHEME.updateWith(props)
    } catch (e: IllegalArgumentException) {
      return
    }
    view.mEmulator?.mColors?.reset()
    theme?.background?.let { bg ->
      runCatching { Color.parseColor(bg) }.getOrNull()?.let { setBackgroundColor(it) }
    }
    view.invalidate()
  }

  fun write(data: ByteArray) {
    view.stats.bytes += data.size
    session.feed(data, data.size)
  }

  fun paste(text: String) {
    session.emulator?.paste(text)
  }

  fun scrollToBottom() {
    view.topRow = 0
    view.onScreenUpdated()
  }

  fun copySelection() {
    if (!view.isSelectingText) return
    view.selectedText?.let { copyToClipboard(it) }
    view.stopTextSelectionMode()
  }

  fun focusTerminal() {
    view.requestFocus()
    context.getSystemService(InputMethodManager::class.java)?.showSoftInput(view, 0)
  }

  fun blurTerminal() {
    context.getSystemService(InputMethodManager::class.java)
      ?.hideSoftInputFromWindow(view.windowToken, 0)
  }

  fun stats(): Map<String, Any> = view.stats.snapshot()

  internal fun destroy() = session.finish()

  private fun copyToClipboard(text: String) {
    context.getSystemService(ClipboardManager::class.java)
      ?.setPrimaryClip(ClipData.newPlainText("terminal", text))
  }

  private inner class SessionClient : TerminalSessionClient {
    override fun onTextChanged(changedSession: TerminalSession) = view.onScreenUpdated()

    override fun onTitleChanged(changedSession: TerminalSession) {
      onTitleChange(mapOf("title" to (changedSession.title ?: "")))
    }

    override fun onSessionFinished(finishedSession: TerminalSession) {}

    override fun onCopyTextToClipboard(session: TerminalSession, text: String) =
      copyToClipboard(text)

    override fun onPasteTextFromClipboard(session: TerminalSession?) {
      val clip = context.getSystemService(ClipboardManager::class.java)?.primaryClip ?: return
      if (clip.itemCount == 0) return
      val text = clip.getItemAt(0).coerceToText(context)?.toString() ?: return
      this@TermixTermuxView.session.emulator?.paste(text)
    }

    override fun onBell(session: TerminalSession) = onBell(emptyMap())

    override fun onColorsChanged(session: TerminalSession) = view.invalidate()

    override fun onTerminalCursorStateChange(state: Boolean) {}

    override fun getTerminalCursorStyle(): Int? = null

    override fun logError(tag: String?, message: String?) {}
    override fun logWarn(tag: String?, message: String?) {}
    override fun logInfo(tag: String?, message: String?) {}
    override fun logDebug(tag: String?, message: String?) {}
    override fun logVerbose(tag: String?, message: String?) {}
    override fun logStackTraceWithMessage(tag: String?, message: String?, e: Exception?) {}
    override fun logStackTrace(tag: String?, e: Exception?) {}
  }

  private inner class ViewClient : TerminalViewClient {
    // Termux passes the running scale and keeps what we return. Every 0.1
    // steps the font by 1dp, like the ghostty view.
    override fun onScale(scale: Float): Float {
      if (scale < 1.1f && scale > 0.9f) return scale
      setFontSize(fontSizeDp + if (scale > 1f) 1f else -1f)
      return 1f
    }

    override fun onSingleTapUp(e: MotionEvent) = focusTerminal()

    override fun shouldBackButtonBeMappedToEscape() = false
    override fun shouldEnforceCharBasedInput() = false
    override fun shouldUseCtrlSpaceWorkaround() = false
    override fun isTerminalViewSelected() = true
    override fun copyModeChanged(copyMode: Boolean) {}
    override fun onKeyDown(keyCode: Int, e: KeyEvent, session: TerminalSession) = false
    override fun onKeyUp(keyCode: Int, e: KeyEvent) = false
    override fun onLongPress(event: MotionEvent) = false
    override fun readControlKey() = false
    override fun readAltKey() = false
    override fun readShiftKey() = false
    override fun readFnKey() = false
    override fun onCodePoint(codePoint: Int, ctrlDown: Boolean, session: TerminalSession) = false

    override fun onEmulatorSet() {
      view.setTerminalCursorBlinkerRate(0)
    }

    override fun logError(tag: String?, message: String?) {}
    override fun logWarn(tag: String?, message: String?) {}
    override fun logInfo(tag: String?, message: String?) {}
    override fun logDebug(tag: String?, message: String?) {}
    override fun logVerbose(tag: String?, message: String?) {}
    override fun logStackTraceWithMessage(tag: String?, message: String?, e: Exception?) {}
    override fun logStackTrace(tag: String?, e: Exception?) {}
  }

  private companion object {
    const val TRANSCRIPT_ROWS = 10_000
    const val MIN_FONT_DP = 6f
    const val MAX_FONT_DP = 40f
  }
}
