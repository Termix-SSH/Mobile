package expo.modules.termixterminalghostty

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.SystemClock
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Key row shown above the soft keyboard, mirroring the iOS input accessory
 * bar: the same default key set (esc/tab/ctrl/alt, arrows, shell symbols,
 * paste) as 36dp circular buttons. Ctrl/Alt are sticky with the iOS
 * three-state cycle - tap arms them for the next key, a quick double tap
 * locks them (bottom indicator) until tapped again.
 */
internal class TerminalAccessoryBar(context: Context) : HorizontalScrollView(context) {
  var onKey: ((keyCode: Int) -> Unit)? = null
  var onText: ((text: String) -> Unit)? = null
  var onPaste: (() -> Unit)? = null

  private val row = LinearLayout(context).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    val edge = dp(EDGE_PADDING_DP)
    setPadding(edge, 0, edge, 0)
  }
  private val ctrl = StickyModifier(SystemClock::uptimeMillis)
  private val alt = StickyModifier(SystemClock::uptimeMillis)
  private lateinit var ctrlButton: KeyButton
  private lateinit var altButton: KeyButton

  init {
    setBackgroundColor(BAR_BACKGROUND)
    isHorizontalScrollBarEnabled = false
    minimumHeight = dp(BAR_HEIGHT_DP)
    addView(row, LayoutParams(LayoutParams.WRAP_CONTENT, dp(BAR_HEIGHT_DP)))

    addKey("⎋", "Escape") { onKey?.invoke(KeyEvent.KEYCODE_ESCAPE) }
    addKey("⇥", "Tab") { onKey?.invoke(KeyEvent.KEYCODE_TAB) }
    ctrlButton = addKey("⌃", "Control") { toggle(ctrl) }
    altButton = addKey("⌥", "Alt") { toggle(alt) }
    addDivider()
    addKey("◀", "Arrow left") { onKey?.invoke(KeyEvent.KEYCODE_DPAD_LEFT) }
    addKey("▲", "Arrow up") { onKey?.invoke(KeyEvent.KEYCODE_DPAD_UP) }
    addKey("▼", "Arrow down") { onKey?.invoke(KeyEvent.KEYCODE_DPAD_DOWN) }
    addKey("▶", "Arrow right") { onKey?.invoke(KeyEvent.KEYCODE_DPAD_RIGHT) }
    addDivider()
    val symbols = arrayOf(
      "|" to "Pipe", "/" to "Slash", "~" to "Tilde", "-" to "Hyphen",
      "_" to "Underscore", "`" to "Backtick", "'" to "Single quote", "\"" to "Double quote"
    )
    for ((symbol, name) in symbols) {
      addKey(symbol, name) { onText?.invoke(symbol) }
    }
    addKey("⎘", "Paste") { onPaste?.invoke() }
  }

  /** KeyEvent meta bits for the currently lit sticky modifiers. */
  fun stickyMetaState(): Int {
    var meta = 0
    if (ctrl.engaged) meta = meta or KeyEvent.META_CTRL_ON or KeyEvent.META_CTRL_LEFT_ON
    if (alt.engaged) meta = meta or KeyEvent.META_ALT_ON or KeyEvent.META_ALT_LEFT_ON
    return meta
  }

  /** A key consumed the modifiers: armed ones unlatch, locked ones persist. */
  fun consumeSticky() {
    ctrl.consume()
    alt.consume()
    syncModifierVisuals()
  }

  private fun toggle(modifier: StickyModifier) {
    modifier.tap()
    syncModifierVisuals()
  }

  private fun syncModifierVisuals() {
    ctrlButton.setActivation(ctrl.engaged, ctrl.locked)
    altButton.setActivation(alt.engaged, alt.locked)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      ctrlButton.stateDescription = stickyStateDescription(ctrl)
      altButton.stateDescription = stickyStateDescription(alt)
    }
  }

  private fun stickyStateDescription(modifier: StickyModifier): String? = when {
    modifier.locked -> "Locked"
    modifier.engaged -> "Armed for the next key"
    else -> null
  }

  private fun addKey(label: String, description: String, onTap: () -> Unit): KeyButton {
    val key = KeyButton(context)
    key.text = label
    key.contentDescription = description
    key.setOnClickListener {
      it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
      onTap()
    }
    val size = dp(BUTTON_SIZE_DP)
    val params = LinearLayout.LayoutParams(size, size)
    params.marginEnd = dp(ITEM_SPACING_DP)
    row.addView(key, params)
    return key
  }

  private fun addDivider() {
    val dot = View(context)
    dot.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    val shape = GradientDrawable()
    shape.shape = GradientDrawable.OVAL
    shape.setColor(DIVIDER_COLOR)
    dot.background = shape
    val size = dp(DIVIDER_SIZE_DP)
    val params = LinearLayout.LayoutParams(size, size)
    params.marginEnd = dp(ITEM_SPACING_DP)
    row.addView(dot, params)
  }

  private fun dp(value: Float): Int = (value * resources.displayMetrics.density).toInt()

  /** 36dp circular key; locked modifiers draw the iOS bottom bar indicator. */
  private class KeyButton(context: Context) : TextView(context) {
    private var locked = false
    private val lockPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val lockRect = RectF()
    private val shape = GradientDrawable().apply { shape = GradientDrawable.OVAL }

    init {
      typeface = Typeface.MONOSPACE
      textSize = KEY_TEXT_SIZE_SP
      gravity = Gravity.CENTER
      includeFontPadding = false
      background = shape
      setActivation(active = false, locked = false)
    }

    fun setActivation(active: Boolean, locked: Boolean) {
      this.locked = locked
      shape.setColor(if (active) ACTIVE_BACKGROUND else REGULAR_BACKGROUND)
      setTextColor(if (active) ACTIVE_FOREGROUND else REGULAR_FOREGROUND)
      lockPaint.color = currentTextColor
      invalidate()
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
      super.onInitializeAccessibilityNodeInfo(info)
      info.className = "android.widget.Button"
    }

    override fun onDraw(canvas: Canvas) {
      super.onDraw(canvas)
      if (!locked) return
      val density = resources.displayMetrics.density
      val barWidth = 14f * density
      val barHeight = 3f * density
      lockRect.set(
        (width - barWidth) / 2f,
        height - barHeight - 3f * density,
        (width + barWidth) / 2f,
        height - 3f * density
      )
      canvas.drawRoundRect(lockRect, barHeight / 2f, barHeight / 2f, lockPaint)
    }
  }

  private companion object {
    // Mirrors the iOS bar metrics and (dark) system colors.
    const val BAR_HEIGHT_DP = 52f
    const val BUTTON_SIZE_DP = 36f
    const val ITEM_SPACING_DP = 8f
    const val EDGE_PADDING_DP = 10f
    const val DIVIDER_SIZE_DP = 6f
    const val KEY_TEXT_SIZE_SP = 15f

    const val BAR_BACKGROUND = 0xF21C1C1E.toInt()
    const val REGULAR_BACKGROUND = 0xEB3A3A3C.toInt()
    const val REGULAR_FOREGROUND = 0xFFEBEBF0.toInt()
    const val ACTIVE_BACKGROUND = 0xFF0A84FF.toInt()
    const val ACTIVE_FOREGROUND = 0xFFFFFFFF.toInt()
    const val DIVIDER_COLOR = 0x47FFFFFF
  }
}
