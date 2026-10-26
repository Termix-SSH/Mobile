package expo.modules.termixterminal

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.text.InputType
import android.view.ActionMode
import android.view.Choreographer
import android.view.GestureDetector
import android.view.HapticFeedbackConstants
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.accessibility.AccessibilityManager
import android.view.accessibility.AccessibilityNodeInfo
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import android.widget.OverScroller
import com.facebook.react.common.assets.ReactFontManager
import expo.modules.termixpipe.BytePipe
import expo.modules.termixpipe.PipeSink
import expo.modules.termixpipe.TermixPipes
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Canvas-backed ghostty terminal grid.
 *
 * Owns a libghostty-vt session via [GhosttyVt]. Pty output arrives through a [BytePipe], either
 * straight from the SSH engine (see termix-pipe) or from JS through [write], and is parsed on the
 * view's own thread. A full pipe pauses its producer, so a slow screen holds back the network. The
 * main thread draws dirty-row snapshots once per frame. One lock guards every call on the handle.
 */
internal class GhosttyTerminalView(context: Context) : View(context) {
  var onInputBytes: ((ByteArray) -> Unit)? = null
  var onGridResize: ((cols: Int, rows: Int) -> Unit)? = null
  var onBell: (() -> Unit)? = null
  var onTitleChange: ((title: String) -> Unit)? = null
  var onDirectoryChange: ((path: String) -> Unit)? = null
  var onScrollState: ((atBottom: Boolean) -> Unit)? = null
  var onLink: ((url: String) -> Unit)? = null
  var onCopied: ((text: String, fromProgram: Boolean) -> Unit)? = null
  var onPasteRequest: ((id: Int, text: String) -> Unit)? = null
  var onFontSizeChange: ((dp: Float) -> Unit)? = null
  var onModifiers: ((ctrl: String, alt: String) -> Unit)? = null
  var onOutput: (() -> Unit)? = null
  /** The line at the cursor once output settles, while [promptWatch] is on. */
  var onPromptLine: ((line: String) -> Unit)? = null
  /** The app's own menu for the session, from More in the long press menu. */
  var onMenu: (() -> Unit)? = null
  /** An app shortcut from a hardware keyboard, by id. The shell never sees it. */
  var onShortcut: ((id: String) -> Unit)? = null
  var promptWatch = false
    set(value) {
      field = value
      if (!value) {
        removeCallbacks(promptRunnable)
        lastPromptLine = ""
      }
    }
  private var lastPromptLine = ""
  private val promptRunnable = Runnable { reportPromptLine() }

  private val vtLock = Any()
  private var handle: Long = GhosttyVt.nativeCreate(INITIAL_COLS, INITIAL_ROWS, DEFAULT_SCROLLBACK)
  private var finished = false
  private var destroyed = false

  // ── Parsing ──
  private val vtThread = HandlerThread("termix-vt").also { it.start() }
  private val vtHandler = Handler(vtThread.looper)
  private val mainHandler = Handler(Looper.getMainLooper())
  private val localPipe = BytePipe()
  private var pipe: BytePipe = localPipe
  private var pipeId: String? = null
  private val drainQueued = AtomicBoolean(false)
  private val framePosted = AtomicBoolean(false)
  private val pendingEvents = AtomicInteger(0)
  private val pendingReplies = ArrayList<ByteArray>()
  private val sink = PipeSink {
    if (drainQueued.compareAndSet(false, true)) vtHandler.post(drainRunnable)
  }
  private val drainRunnable = Runnable { drain() }

  // Mode bits read after each parse, used by touch and keys on the main thread.
  @Volatile private var mouseTracking = false
  @Volatile private var altScreen = false
  @Volatile private var altScroll = false
  @Volatile private var focusEvents = false

  // ── Cell metrics ──
  private var fontFamily = DEFAULT_FONT
  private var fontSizeDp = FONT_SIZE_DP
  private var lineHeight = 1f
  private var letterSpacingDp = 0f
  private var regularFace = appFont(Typeface.NORMAL)
  private val textPaint = newTextPaint(regularFace)
  private val boldPaint = newTextPaint(appFont(Typeface.BOLD))
  private val italicPaint = newTextPaint(appFont(Typeface.ITALIC))
  private val boldItalicPaint = newTextPaint(appFont(Typeface.BOLD_ITALIC))
  private val preeditPaint = newTextPaint(regularFace)

  // Nerd Font private-use glyphs (powerline, devicons, …) are absent from the
  // system fallback chain; route those cells to the bundled symbols-only font.
  private val symbolsPaint: Paint? = try {
    newTextPaint(Typeface.createFromAsset(context.assets, SYMBOLS_FONT_ASSET))
  } catch (e: RuntimeException) {
    null
  }
  private val fillPaint = Paint()
  private val cursorPaint = Paint()
  private var cellWidth = 1f
  private var cellHeight = 1
  private var baseline = 0f
  private val underlineThickness = max(1f, resources.displayMetrics.density)

  // ── Grid state ──
  private var cols = INITIAL_COLS
  private var rows = INITIAL_ROWS
  private var bitmap: Bitmap? = null
  private var bitmapCanvas: Canvas? = null
  private var snapshotBuf: ByteBuffer? = null
  private var rowChars = CharArray(0)
  private var cellFg = IntArray(0)
  private var cellBg = IntArray(0)
  private var cellTextOff = IntArray(0)
  private var cellTextLen = IntArray(0)
  private var cellFlags = IntArray(0)
  private var rowSelStart = IntArray(0)
  private var rowSelEnd = IntArray(0)
  private var rowSelEndWide = BooleanArray(0)
  // Visible text per row for links and screen readers: the row string and where each cell starts
  // in it (-1 for the second half of a wide character).
  private var rowText = arrayOfNulls<String>(0)
  private var rowCellStart = arrayOfNulls<IntArray>(0)

  // ── Selection state ──
  private var selectionMode = false
  private var actionMode: ActionMode? = null
  private var draggingHandle = HANDLE_NONE
  private var dragAnchorCol = 0
  private var dragAnchorRow = 0
  private var dragBiasRows = 0
  private var lastPressCol = 0
  private var lastPressRow = 0
  private var pressLink: String? = null
  private val handlePaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val handleRadius = HANDLE_RADIUS_DP * resources.displayMetrics.density
  private var handleColor = HANDLE_COLOR
  private val magnifier =
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
      android.widget.Magnifier(this)
    } else {
      null
    }

  private var defaultBg = 0xFF000000.toInt()
  private var defaultFg = 0xFFFFFFFF.toInt()
  // Themed selection colors; when unset, selected cells keep the classic
  // fg/bg swap. Cursor color rides the snapshot header (0 = unconfigured).
  private var selectionBg: Int? = null
  private var selectionFg: Int? = null
  private var cursorAccent: Int? = null
  private var cursorColor = 0
  private var cursorX = -1
  private var cursorY = -1
  private var cursorStyle = CURSOR_STYLE_BLOCK
  private var cursorVisible = false
  private var cursorBlinks = false

  // The cursor is an onDraw overlay, so blinking only re-blits the cached
  // bitmap; the grid is untouched.
  private var blinkPhaseOn = true
  private var blinkScheduled = false
  private val blinkRunnable = object : Runnable {
    override fun run() {
      if (!blinkScheduled) return
      blinkPhaseOn = !blinkPhaseOn
      invalidate()
      postDelayed(this, BLINK_INTERVAL_MS)
    }
  }

  private var framePending = false
  private val frameCallback = Choreographer.FrameCallback {
    framePending = false
    val start = System.nanoTime()
    renderFrame()
    stats.recordRender(System.nanoTime() - start)
  }

  // Lab readout: render cost per frame and bytes fed in.
  internal val stats = RenderStats()

  // ── Bell ──
  private var bellSound = false
  private var bellVisual = false
  private var haptics = true
  private var lastBellAt = 0L
  private var flashUntil = 0L
  private var tone: ToneGenerator? = null

  // ── Keyboard ──
  private val ime = ImeShadow()
  private var cjkKeyboard = false
  private val ctrl = StickyModifier(SystemClock::uptimeMillis)
  private val alt = StickyModifier(SystemClock::uptimeMillis)
  private var nextPasteId = 1
  private val pendingPastes = HashMap<Int, ByteArray>()

  // ── Screen reader ──
  private var announcedLines: List<String> = emptyList()
  private val announceRunnable = Runnable { announceOutput() }

  // ── Scrollback state ──
  private var scrollAccum = 0f
  private val scroller = OverScroller(context)
  private var flingLastY = 0
  private var flingX = 0f
  private var scrollbarTotal = 0L
  private var scrollbarOffset = 0L
  private var scrollbarLen = 0L
  private var lastAtBottom = true
  private var lastScrollActivityAt = 0L
  private val scrollbarPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val flingRunnable = object : Runnable {
    override fun run() {
      if (handle == 0L || !scroller.computeScrollOffset()) return
      val y = scroller.currY
      scrollAccum += (y - flingLastY).toFloat()
      flingLastY = y
      val deltaRows = (scrollAccum / cellHeight).toInt()
      if (deltaRows != 0) {
        scrollAccum -= deltaRows * cellHeight
        scrollRows(flingX, height / 2f, deltaRows)
      }
      postOnAnimation(this)
    }
  }

  private val gestureDetector = GestureDetector(
    context,
    object : GestureDetector.SimpleOnGestureListener() {
      override fun onDown(e: MotionEvent) = true

      override fun onSingleTapUp(e: MotionEvent): Boolean {
        if (selectionMode || actionMode != null) {
          clearSelection()
          return true
        }
        // A link opens on tap unless the program wants the mouse (tmux, vim); then the long press
        // menu has Open link.
        if (!mouseTracking) {
          val link = linkAt(e.x, e.y)
          if (link != null) {
            onLink?.invoke(link)
            return true
          }
        }
        if (sendMouseClick(e.x, e.y)) {
          requestFocus()
          return true
        }
        showKeyboard()
        return true
      }

      // A double tap selects the word, like a long press without the drag.
      override fun onDoubleTap(e: MotionEvent): Boolean {
        if (handle == 0L || finished || mouseTracking) return false
        lastPressCol = colAt(e.x)
        lastPressRow = rowAt(e.y)
        pressLink = linkAt(e.x, e.y)
        selectionMode = synchronized(vtLock) {
          handle != 0L && GhosttyVt.nativeSelectWord(handle, lastPressCol, lastPressRow)
        }
        scheduleFrame()
        if (selectionMode) startTerminalActionMode()
        return true
      }

      override fun onLongPress(e: MotionEvent) {
        if (handle == 0L || finished || scaleDetector.isInProgress) return
        lastPressCol = colAt(e.x)
        lastPressRow = rowAt(e.y)
        pressLink = linkAt(e.x, e.y)
        if (haptics) performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        selectionMode = synchronized(vtLock) {
          handle != 0L && GhosttyVt.nativeSelectWord(handle, lastPressCol, lastPressRow)
        }
        scheduleFrame()
        if (selectionMode) {
          // Keep dragging without lifting: extend from the pressed cell.
          draggingHandle = HANDLE_END
          dragAnchorCol = lastPressCol
          dragAnchorRow = lastPressRow
          dragBiasRows = 0
        }
        startTerminalActionMode()
      }

      override fun onScroll(
        e1: MotionEvent?,
        e2: MotionEvent,
        distanceX: Float,
        distanceY: Float
      ): Boolean {
        if (handle == 0L || scaleDetector.isInProgress) return false
        scrollAccum += distanceY
        val deltaRows = (scrollAccum / cellHeight).toInt()
        if (deltaRows != 0) {
          scrollAccum -= deltaRows * cellHeight
          scrollRows(e2.x, e2.y, deltaRows)
        }
        return true
      }

      override fun onFling(
        e1: MotionEvent?,
        e2: MotionEvent,
        velocityX: Float,
        velocityY: Float
      ): Boolean {
        if (handle == 0L || scaleDetector.isInProgress) return false
        // Finger up (negative velocity) scrolls content down: invert.
        flingLastY = 0
        flingX = e2.x
        scroller.fling(0, 0, 0, -velocityY.toInt(), 0, 0, Int.MIN_VALUE, Int.MAX_VALUE)
        postOnAnimation(flingRunnable)
        return true
      }
    }
  )

  private var twoFingerLastY = 0f
  private var twoFingerAccum = 0f

  // Every 0.1 of accumulated scale steps the font size by 1dp.
  private var pinchScale = 1f
  private var pinchLastScale = 1f
  private val scaleDetector = ScaleGestureDetector(
    context,
    object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
      override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
        pinchScale = 1f
        pinchLastScale = 1f
        twoFingerLastY = detector.focusY
        twoFingerAccum = 0f
        return true
      }

      override fun onScale(detector: ScaleGestureDetector): Boolean {
        // Two fingers moving together scroll, also while one finger drives the mouse.
        twoFingerAccum += twoFingerLastY - detector.focusY
        twoFingerLastY = detector.focusY
        val rows = (twoFingerAccum / cellHeight).toInt()
        if (rows != 0) {
          twoFingerAccum -= rows * cellHeight
          scrollRows(detector.focusX, detector.focusY, rows)
        }
        pinchScale *= detector.scaleFactor
        val steps = ((pinchScale - pinchLastScale) / PINCH_SCALE_STEP).toInt()
        if (steps != 0) {
          pinchLastScale += steps * PINCH_SCALE_STEP
          setFontSize(fontSizeDp + steps)
          onFontSizeChange?.invoke(fontSizeDp)
        }
        return true
      }
    }
  )

  init {
    isFocusable = true
    isFocusableInTouchMode = true
    contentDescription = "Terminal"
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    updateMetrics()
    pipe.setSink(sink)
  }

  // Fonts are embedded with the expo-font config plugin, which registers them
  // with React Native's font manager.
  private fun appFont(style: Int): Typeface {
    if (fontFamily == SYSTEM_FONT) return Typeface.create(Typeface.MONOSPACE, style)
    return try {
      ReactFontManager.getInstance().getTypeface(fontFamily, style, context.assets)
    } catch (e: RuntimeException) {
      Typeface.create(Typeface.MONOSPACE, style)
    }
  }

  private fun newTextPaint(typeface: Typeface) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    this.typeface = typeface
    textSize = fontSizeDp * resources.displayMetrics.density
    fontFeatureSettings = LIGATURES
  }

  private fun textPaints() = arrayOf(textPaint, boldPaint, italicPaint, boldItalicPaint, preeditPaint, symbolsPaint)

  private fun updateMetrics() {
    val density = resources.displayMetrics.density
    val px = fontSizeDp * density
    for (paint in textPaints()) paint?.textSize = px
    val metrics = textPaint.fontMetrics
    val glyphHeight = metrics.descent - metrics.ascent
    cellWidth = textPaint.measureText("M") + letterSpacingDp * density
    cellHeight = max(1, ceil(glyphHeight * lineHeight).toInt())
    baseline = (cellHeight - glyphHeight) / 2f - metrics.ascent
  }

  /** Base size in dp, clamped to 4-64. Content reflows in place. */
  fun setFontSize(dp: Float) {
    val clamped = dp.coerceIn(MIN_FONT_SIZE_DP, MAX_FONT_SIZE_DP)
    if (clamped == fontSizeDp) return
    fontSizeDp = clamped
    relayout()
  }

  fun setFontFamily(family: String?) {
    val next = family?.takeIf { it.isNotBlank() } ?: DEFAULT_FONT
    if (next == fontFamily) return
    fontFamily = next
    regularFace = appFont(Typeface.NORMAL)
    textPaint.typeface = regularFace
    preeditPaint.typeface = regularFace
    boldPaint.typeface = appFont(Typeface.BOLD)
    italicPaint.typeface = appFont(Typeface.ITALIC)
    boldItalicPaint.typeface = appFont(Typeface.BOLD_ITALIC)
    relayout()
  }

  fun setLineHeight(value: Float) {
    val next = value.coerceIn(0.8f, 2f)
    if (next == lineHeight) return
    lineHeight = next
    relayout()
  }

  fun setLetterSpacing(dp: Float) {
    val next = dp.coerceIn(0f, 8f)
    if (next == letterSpacingDp) return
    letterSpacingDp = next
    relayout()
  }

  private fun relayout() {
    updateMetrics()
    // Cell geometry moved under any active selection handles.
    if (selectionMode || actionMode != null) clearSelection()
    updateGridGeometry(force = true)
  }

  /**
   * Apply theme colors. Foreground/background/cursor/palette go into the
   * terminal itself (so OSC 4/10/11/12 queries and resets stay truthful);
   * selection colors are a renderer concern and stay here. Null fields
   * clear back to the defaults.
   */
  fun setTheme(
    foreground: String?,
    background: String?,
    cursorColor: String?,
    cursorAccent: String?,
    selectionBackground: String?,
    selectionForeground: String?,
    palette: Array<String?>?
  ) {
    selectionBg = selectionBackground?.let { parseColor(it) }
    selectionFg = selectionForeground?.let { parseColor(it) }
    this.cursorAccent = cursorAccent?.let { parseColor(it) }
    themeColors = arrayOf(foreground, background, cursorColor)
    themePalette = palette
    applyTheme()
    scheduleFrame()
  }

  private var themeColors: Array<String?>? = null
  private var themePalette: Array<String?>? = null
  private var cursorChoice = GhosttyVt.CURSOR_BLOCK to true

  private fun applyTheme() {
    val colors = themeColors ?: return
    synchronized(vtLock) {
      if (handle == 0L) return
      GhosttyVt.nativeSetTheme(handle, colors[0], colors[1], colors[2], themePalette)
    }
  }

  private fun applyCursor() {
    synchronized(vtLock) {
      if (handle == 0L) return
      GhosttyVt.nativeSetDefaultCursor(handle, cursorChoice.first, cursorChoice.second)
    }
  }

  fun setHandleColor(color: String?) {
    handleColor = color?.let { parseColor(it) } ?: HANDLE_COLOR
    invalidate()
  }

  private fun parseColor(value: String): Int? = GhosttyVt.nativeParseColor(value).takeIf { it != 0 }

  fun setCursor(style: String?, blink: Boolean) {
    val native = when (style) {
      "bar" -> GhosttyVt.CURSOR_BAR
      "underline" -> GhosttyVt.CURSOR_UNDERLINE
      else -> GhosttyVt.CURSOR_BLOCK
    }
    cursorChoice = native to blink
    applyCursor()
    scheduleFrame()
  }

  /** Lines kept above the screen. Only takes effect before the first output. */
  fun setScrollback(lines: Int) {
    synchronized(vtLock) {
      if (handle == 0L || stats.bytes > 0) return
      GhosttyVt.nativeFree(handle)
      handle = GhosttyVt.nativeCreate(cols, rows, lines.coerceIn(100, 100_000).toLong())
    }
    applyTheme()
    applyCursor()
    updateGridGeometry(force = true)
  }

  fun setBell(style: String?, haptics: Boolean) {
    bellSound = style == "sound" || style == "both"
    bellVisual = style == "visual" || style == "both"
    this.haptics = haptics
  }

  // ── Session I/O ──

  /** Takes output from this pipe; null uses the view's own, fed by [write]. */
  fun setPipe(id: String?) {
    if (id == pipeId) return
    pipe.detachSink(sink)
    pipeId?.let { TermixPipes.release(it) }
    pipeId = id
    pipe = if (id == null) localPipe else TermixPipes.get(id)
    pipe.setSink(sink)
  }

  /** Feed pty output from JS. It queues behind piped output, in order. */
  fun write(data: ByteArray) {
    if (data.isNotEmpty()) pipe.push(data)
  }

  private fun drain() {
    drainQueued.set(false)
    val start = SystemClock.uptimeMillis()
    while (!destroyed) {
      val chunk = pipe.read(PARSE_SLICE) ?: break
      synchronized(vtLock) {
        if (handle == 0L) return
        stats.bytes += chunk.size
        val reply = GhosttyVt.nativeWrite(handle, chunk)
        if (reply != null && reply.isNotEmpty()) synchronized(pendingReplies) { pendingReplies.add(reply) }
        val flags = GhosttyVt.nativeTakeEventFlags(handle) or EVENT_OUTPUT
        pendingEvents.getAndUpdate { it or flags }
        GhosttyVt.nativeModes(handle)?.let { modes ->
          mouseTracking = modes[0] != 0
          altScreen = modes[1] != 0
          altScroll = modes[2] != 0
          focusEvents = modes[3] != 0
        }
      }
      postToMain()
      // Yield so a flood can't starve other work on this thread, and the screen keeps up.
      if (SystemClock.uptimeMillis() - start > PARSE_BUDGET_MS) {
        if (drainQueued.compareAndSet(false, true)) vtHandler.post(drainRunnable)
        return
      }
    }
  }

  private fun postToMain() {
    if (framePosted.compareAndSet(false, true)) {
      mainHandler.post {
        framePosted.set(false)
        if (destroyed) return@post
        flushReplies()
        drainTerminalEvents(pendingEvents.getAndSet(0))
        holdBlinkSolid()
        scheduleFrame()
      }
    }
  }

  private fun flushReplies() {
    val replies = synchronized(pendingReplies) {
      if (pendingReplies.isEmpty()) return
      val copy = pendingReplies.toList()
      pendingReplies.clear()
      copy
    }
    if (finished) return
    for (reply in replies) onInputBytes?.invoke(reply)
  }

  private fun drainTerminalEvents(flags: Int) {
    if (flags == 0) return
    if (flags and EVENT_OUTPUT != 0) {
      onOutput?.invoke()
      if (promptWatch) {
        removeCallbacks(promptRunnable)
        postDelayed(promptRunnable, PROMPT_DELAY_MS)
      }
      if (screenReaderOn()) {
        removeCallbacks(announceRunnable)
        postDelayed(announceRunnable, ANNOUNCE_DELAY_MS)
      }
    }
    if (flags and GhosttyVt.EVENT_BELL != 0) ringBell()
    if (flags and GhosttyVt.EVENT_TITLE != 0) {
      val title = synchronized(vtLock) { if (handle == 0L) null else GhosttyVt.nativeGetTitle(handle) }
      onTitleChange?.invoke(title?.toString(Charsets.UTF_8).orEmpty())
    }
    if (flags and GhosttyVt.EVENT_PWD != 0) {
      val pwd = synchronized(vtLock) { if (handle == 0L) null else GhosttyVt.nativeGetPwd(handle) }
      onDirectoryChange?.invoke(pwd?.toString(Charsets.UTF_8).orEmpty())
    }
    if (flags and GhosttyVt.EVENT_CLIPBOARD != 0) {
      val bytes = synchronized(vtLock) { if (handle == 0L) null else GhosttyVt.nativeTakeClipboard(handle) }
      if (bytes != null) {
        val text = String(bytes, Charsets.UTF_8)
        setClipboard(text)
        onCopied?.invoke(text, true)
      }
    }
  }

  private fun ringBell() {
    val now = SystemClock.uptimeMillis()
    if (now - lastBellAt < BELL_MIN_GAP_MS) return
    lastBellAt = now
    onBell?.invoke()
    if (haptics) performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    if (bellSound) {
      try {
        val gen = tone ?: ToneGenerator(AudioManager.STREAM_NOTIFICATION, BELL_VOLUME).also { tone = it }
        gen.startTone(ToneGenerator.TONE_PROP_BEEP, BELL_TONE_MS)
      } catch (e: RuntimeException) {
        tone = null
      }
    }
    if (bellVisual) {
      flashUntil = now + BELL_FLASH_MS
      invalidate()
      postDelayed({ invalidate() }, BELL_FLASH_MS)
    }
  }

  /** Mark the underlying PTY as exited: stop forwarding input. */
  fun finish(@Suppress("UNUSED_PARAMETER") exitCode: Int) {
    finished = true
  }

  fun destroy() {
    destroyed = true
    if (framePending) {
      Choreographer.getInstance().removeFrameCallback(frameCallback)
      framePending = false
    }
    blinkScheduled = false
    removeCallbacks(blinkRunnable)
    removeCallbacks(announceRunnable)
    removeCallbacks(promptRunnable)
    scroller.abortAnimation()
    removeCallbacks(flingRunnable)
    actionMode?.finish()
    magnifier?.dismiss()
    pipe.detachSink(sink)
    pipeId?.let { TermixPipes.release(it) }
    vtThread.quitSafely()
    tone?.release()
    tone = null
    synchronized(vtLock) {
      if (handle != 0L) {
        GhosttyVt.nativeFree(handle)
        handle = 0
      }
    }
  }

  private fun sendBytes(bytes: ByteArray) {
    if (!finished && bytes.isNotEmpty()) {
      if (selectionMode) clearSelection()
      // Typing while scrolled into history jumps back to the live view.
      if (scrollbarOffset + scrollbarLen < scrollbarTotal) scrollToBottom()
      holdBlinkSolid()
      onInputBytes?.invoke(bytes)
    }
  }

  private fun markScrollActivity() {
    lastScrollActivityAt = SystemClock.uptimeMillis()
  }

  // ── Keys and text ──

  private fun stickyMeta(): Int {
    var meta = 0
    if (ctrl.engaged) meta = meta or KeyEvent.META_CTRL_ON or KeyEvent.META_CTRL_LEFT_ON
    if (alt.engaged) meta = meta or KeyEvent.META_ALT_ON or KeyEvent.META_ALT_LEFT_ON
    return meta
  }

  private fun consumeSticky() {
    val before = ctrl.activation to alt.activation
    ctrl.consume()
    alt.consume()
    if (before != (ctrl.activation to alt.activation)) reportModifiers()
  }

  private fun reportModifiers() {
    onModifiers?.invoke(ctrl.activation.name.lowercase(), alt.activation.name.lowercase())
  }

  /** The KeyboardBar's Ctrl or Alt: tap arms it for the next key, a quick double tap locks it. */
  fun toggleModifier(name: String) {
    when (name) {
      "ctrl" -> ctrl.tap()
      "alt" -> alt.tap()
      else -> return
    }
    reportModifiers()
  }

  private fun encodeKey(keyCode: Int, action: Int, meta: Int, unshifted: Int, utf8: ByteArray?): ByteArray? =
    synchronized(vtLock) {
      if (handle == 0L) null else GhosttyVt.nativeEncodeKey(handle, keyCode, action, meta, unshifted, utf8)
    }

  private fun sendText(text: CharSequence) {
    if (text.isEmpty()) return
    // A lit sticky modifier turns the next single character into a key chord (Ctrl+C etc.).
    val meta = stickyMeta()
    if (meta != 0 && text.length == 1) {
      val keyCode = charToKeyCode(text[0])
      if (keyCode != KeyEvent.KEYCODE_UNKNOWN) {
        consumeSticky()
        val bytes = encodeKey(keyCode, 1, meta, text[0].lowercaseChar().code, null)
        if (bytes != null && bytes.isNotEmpty()) sendBytes(bytes)
        return
      }
    }
    sendBytes(text.toString().toByteArray(Charsets.UTF_8))
  }

  /** Text from the app's key row, with the sticky modifiers. */
  fun typeText(text: String) {
    if (handle == 0L || finished) return
    ime.reset()
    sendText(text)
  }

  /** A named key from the app's key row, with the sticky modifiers and [shift]. */
  fun sendNamedKey(name: String, shift: Boolean) {
    if (handle == 0L || finished) return
    val keyCode = NAMED_KEYS[name] ?: return
    var meta = stickyMeta()
    if (shift) meta = meta or KeyEvent.META_SHIFT_ON or KeyEvent.META_SHIFT_LEFT_ON
    consumeSticky()
    ime.reset()
    val bytes = encodeKey(keyCode, 1, meta, 0, null) ?: return
    if (bytes.isNotEmpty()) sendBytes(bytes)
  }

  private fun sendBackspaces(count: Int) {
    if (count <= 0) return
    val one = encodeKey(KeyEvent.KEYCODE_DEL, 1, 0, 0, null) ?: byteArrayOf(0x7f)
    val out = ByteArray(one.size * count)
    for (i in 0 until count) System.arraycopy(one, 0, out, i * one.size, one.size)
    sendBytes(out)
  }

  private fun sendEnter() {
    val bytes = encodeKey(KeyEvent.KEYCODE_ENTER, 1, stickyMeta(), 0, null) ?: byteArrayOf(0x0d)
    consumeSticky()
    sendBytes(bytes)
  }

  private fun applyEdit(edit: ImeShadow.Edit) {
    sendBackspaces(edit.backspaces)
    if (edit.text.isEmpty()) return
    val parts = edit.text.split('\n')
    for ((i, part) in parts.withIndex()) {
      if (i > 0) sendEnter()
      if (part.isNotEmpty()) sendText(part)
    }
  }

  /** Paste text from the app (bracketed when the program asks for it). Asks first when unsafe. */
  fun pasteText(text: String) {
    if (handle == 0L || finished || text.isEmpty()) return
    val bytes = text.toByteArray(Charsets.UTF_8)
    if (GhosttyVt.nativeIsPasteSafe(bytes) || onPasteRequest == null) {
      sendPaste(bytes)
      return
    }
    val id = nextPasteId++
    pendingPastes[id] = bytes
    onPasteRequest?.invoke(id, text)
  }

  /** The answer to a paste that needed a yes. */
  fun answerPaste(id: Int, allow: Boolean) {
    val bytes = pendingPastes.remove(id) ?: return
    if (allow) sendPaste(bytes)
  }

  fun scrollToBottom() {
    synchronized(vtLock) {
      if (handle == 0L) return
      GhosttyVt.nativeScrollToBottom(handle)
    }
    scheduleFrame()
  }

  fun copySelectionToClipboard() = copySelection()

  fun selectAll() = selectAllContent()

  // ── Search ──

  var onSearch: ((total: Int, index: Int) -> Unit)? = null
  private var searchHits: List<SearchHit> = emptyList()
  private var searchIndex = -1

  /** Finds every hit and shows the newest, nearest the prompt. */
  fun search(query: String, caseSensitive: Boolean, wholeWord: Boolean, regex: Boolean) {
    val text = synchronized(vtLock) {
      if (handle == 0L) null else GhosttyVt.nativeScreenText(handle)
    }
    val lines = text?.toString(Charsets.UTF_8)?.split('\n') ?: emptyList()
    searchHits = TerminalSearch.find(lines, query, caseSensitive, wholeWord, regex)
    searchIndex = searchHits.size - 1
    showSearchHit()
  }

  fun searchStep(forward: Boolean) {
    if (searchHits.isEmpty()) return
    val n = searchHits.size
    searchIndex = (searchIndex + (if (forward) 1 else -1) + n) % n
    showSearchHit()
  }

  fun clearSearch() {
    val had = searchHits.isNotEmpty()
    searchHits = emptyList()
    searchIndex = -1
    if (had) clearSelection()
    onSearch?.invoke(0, -1)
  }

  private fun showSearchHit() {
    val hit = searchHits.getOrNull(searchIndex)
    if (hit == null) {
      onSearch?.invoke(0, -1)
      return
    }
    synchronized(vtLock) {
      if (handle == 0L) return
      GhosttyVt.nativeSelectScreenRange(handle, hit.row, hit.startCol, hit.endCol)
      // Bring the hit's row near the middle when it is off screen.
      GhosttyVt.nativeScrollbar(handle)?.let { bar ->
        val offset = bar[1].toInt()
        val len = bar[2].toInt()
        if (hit.row < offset || hit.row >= offset + len) {
          GhosttyVt.nativeScroll(handle, hit.row - offset - len / 2)
        }
      }
    }
    scheduleFrame()
    onSearch?.invoke(searchHits.size, searchIndex)
  }

  fun showKeyboard() {
    requestFocus()
    context.getSystemService(InputMethodManager::class.java)?.showSoftInput(this, 0)
  }

  fun hideKeyboard() {
    context.getSystemService(InputMethodManager::class.java)
      ?.hideSoftInputFromWindow(windowToken, 0)
    // A hidden tab that keeps focus gets the keyboard back when a dialog closes.
    clearFocus()
  }

  // ── Mouse ──

  private fun colAt(x: Float) = (x / cellWidth).toInt().coerceIn(0, cols - 1)

  private fun rowAt(y: Float) = (y / cellHeight).toInt().coerceIn(0, rows - 1)

  /** Taps become clicks while the program has mouse tracking on. */
  private fun sendMouseClick(x: Float, y: Float): Boolean {
    if (handle == 0L || finished || !mouseTracking) return false
    val press = encodeMouse(MOUSE_PRESS, MOUSE_LEFT, x, y) ?: return false
    val release = encodeMouse(MOUSE_RELEASE, MOUSE_LEFT, x, y) ?: ByteArray(0)
    sendBytes(press + release)
    return true
  }

  /** Wheel steps for programs that track the mouse, arrows on the alt screen, else scrollback. */
  private fun scrollRows(x: Float, y: Float, deltaRows: Int) {
    if (handle == 0L) return
    if (mouseTracking) {
      val button = if (deltaRows > 0) MOUSE_WHEEL_DOWN else MOUSE_WHEEL_UP
      val step = encodeMouse(MOUSE_PRESS, button, x, y)
      if (step != null) {
        var out = ByteArray(0)
        repeat(abs(deltaRows)) { out += step }
        sendBytes(out)
        return
      }
    }
    if (altScreen && altScroll) {
      val key = if (deltaRows > 0) KeyEvent.KEYCODE_DPAD_DOWN else KeyEvent.KEYCODE_DPAD_UP
      val step = encodeKey(key, 1, 0, 0, null)
      if (step != null) {
        var out = ByteArray(0)
        repeat(abs(deltaRows)) { out += step }
        sendBytes(out)
        return
      }
    }
    synchronized(vtLock) {
      if (handle == 0L) return
      GhosttyVt.nativeScroll(handle, deltaRows)
    }
    markScrollActivity()
    scheduleFrame()
  }

  // The encoder takes whole pixel cells, so place the event in the middle of its cell on an
  // integer grid; that keeps far right columns from drifting.
  private fun encodeMouse(action: Int, button: Int, x: Float, y: Float): ByteArray? {
    val cw = max(1, cellWidth.roundToInt())
    val col = colAt(x)
    val row = rowAt(y)
    return synchronized(vtLock) {
      if (handle == 0L) return null
      GhosttyVt.nativeEncodeMouse(
        handle, action, button, col * cw + cw / 2f, row * cellHeight + cellHeight / 2f,
        cols * cw, rows * cellHeight, cw, cellHeight
      )
    }?.takeIf { it.isNotEmpty() }
  }

  private fun charToKeyCode(char: Char): Int {
    val lower = char.lowercaseChar()
    return when (lower) {
      in 'a'..'z' -> KeyEvent.KEYCODE_A + (lower - 'a')
      in '0'..'9' -> KeyEvent.KEYCODE_0 + (lower - '0')
      ' ' -> KeyEvent.KEYCODE_SPACE
      '[' -> KeyEvent.KEYCODE_LEFT_BRACKET
      ']' -> KeyEvent.KEYCODE_RIGHT_BRACKET
      '-' -> KeyEvent.KEYCODE_MINUS
      '=' -> KeyEvent.KEYCODE_EQUALS
      '\\' -> KeyEvent.KEYCODE_BACKSLASH
      '/' -> KeyEvent.KEYCODE_SLASH
      '.' -> KeyEvent.KEYCODE_PERIOD
      ',' -> KeyEvent.KEYCODE_COMMA
      ';' -> KeyEvent.KEYCODE_SEMICOLON
      '\'' -> KeyEvent.KEYCODE_APOSTROPHE
      '`' -> KeyEvent.KEYCODE_GRAVE
      else -> KeyEvent.KEYCODE_UNKNOWN
    }
  }

  // ── Links ──

  private fun linkAt(x: Float, y: Float): String? {
    val col = colAt(x)
    val row = rowAt(y)
    val osc8 = synchronized(vtLock) {
      if (handle == 0L) null else GhosttyVt.nativeHyperlinkAt(handle, col, row)
    }
    if (osc8 != null) return String(osc8, Charsets.UTF_8)
    val text = rowText.getOrNull(row) ?: return null
    val starts = rowCellStart.getOrNull(row) ?: return null
    return LinkFinder.find(cellTexts(text, starts), col)
  }

  private fun cellTexts(text: String, starts: IntArray): List<String> {
    val cells = ArrayList<String>(starts.size)
    for (i in starts.indices) {
      val start = starts[i]
      if (start < 0) {
        cells.add("")
        continue
      }
      var end = text.length
      for (j in i + 1 until starts.size) {
        if (starts[j] >= 0) {
          end = starts[j]
          break
        }
      }
      cells.add(text.substring(start, end))
    }
    return cells
  }

  // ── Layout / resize ──

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    updateGridGeometry(force = false)
  }

  private fun updateGridGeometry(force: Boolean) {
    if (width <= 0 || height <= 0) return
    val newCols = max(2, floor(width / cellWidth).toInt())
    val newRows = max(2, height / cellHeight)
    val changed = newCols != cols || newRows != rows
    cols = newCols
    rows = newRows
    if (changed || force || bitmap == null) {
      synchronized(vtLock) {
        if (handle == 0L) return
        GhosttyVt.nativeResize(handle, cols, rows, cellWidth.roundToInt(), cellHeight)
      }
      allocateGridBuffers()
      onGridResize?.invoke(cols, rows)
    }
    scheduleFrame()
  }

  private fun allocateGridBuffers() {
    val widthPx = max(1, ceil(cols * cellWidth).toInt())
    val heightPx = max(1, rows * cellHeight)
    bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888).also {
      bitmapCanvas = Canvas(it)
      bitmapCanvas?.drawColor(defaultBg)
    }
    val capacity = HEADER_BYTES +
      rows * (ROW_HEADER_BYTES + cols * CELL_RECORD_BYTES + cols * MAX_CELL_TEXT_UNITS * 2 + 4)
    snapshotBuf = ByteBuffer.allocateDirect(capacity).order(ByteOrder.LITTLE_ENDIAN)
    rowChars = CharArray(cols * MAX_CELL_TEXT_UNITS)
    cellFg = IntArray(cols)
    cellBg = IntArray(cols)
    cellTextOff = IntArray(cols)
    cellTextLen = IntArray(cols)
    cellFlags = IntArray(cols)
    rowSelStart = IntArray(rows) { -1 }
    rowSelEnd = IntArray(rows) { -1 }
    rowSelEndWide = BooleanArray(rows)
    rowText = arrayOfNulls(rows)
    rowCellStart = arrayOfNulls(rows)
  }

  // ── Rendering ──

  private fun scheduleFrame() {
    if (framePending || destroyed) return
    framePending = true
    Choreographer.getInstance().postFrameCallback(frameCallback)
  }

  private fun renderFrame() {
    val buf = snapshotBuf ?: return
    val canvas = bitmapCanvas ?: return

    val rowCount = synchronized(vtLock) {
      if (handle == 0L) return
      val count = GhosttyVt.nativeSnapshot(handle, buf)
      if (count < 0) return
      GhosttyVt.nativeScrollbar(handle)?.let { scrollbar ->
        scrollbarTotal = scrollbar[0]
        scrollbarOffset = scrollbar[1]
        scrollbarLen = scrollbar[2]
      }
      count
    }

    buf.position(0)
    val header = SnapshotHeader.read(buf)
    defaultBg = header.background
    defaultFg = header.foreground
    cursorX = header.cursorX
    cursorY = header.cursorY
    cursorStyle = header.cursorStyle
    cursorVisible = header.cursorVisible
    cursorBlinks = header.cursorBlinks
    cursorColor = header.cursorColor
    syncBlinkTimer()

    if (header.dirtyKind == DIRTY_FULL) canvas.drawColor(defaultBg)
    repeat(rowCount) { drawRowRecord(buf, canvas, header.cols) }
    syncSelectionUi()
    reportScrollState()
    invalidate()
  }

  private fun reportScrollState() {
    val atBottom = scrollbarTotal <= 0 || scrollbarOffset + scrollbarLen >= scrollbarTotal
    if (atBottom != lastAtBottom) {
      lastAtBottom = atBottom
      onScrollState?.invoke(atBottom)
    }
  }

  // ── Selection ──

  /** Top-left / bottom-right cells of the rendered selection, or null. */
  private fun selectionBounds(): IntArray? {
    var top = -1
    var bottom = -1
    for (row in rowSelStart.indices) {
      if (rowSelStart[row] >= 0) {
        if (top < 0) top = row
        bottom = row
      }
    }
    if (top < 0) return null
    return intArrayOf(top, rowSelStart[top], bottom, rowSelEnd[bottom])
  }

  /** Extra columns the end handle shifts right when the last cell is wide. */
  private fun selEndExtraCols(row: Int): Int =
    if (row < rowSelEndWide.size && rowSelEndWide[row]) 1 else 0

  private fun syncSelectionUi() {
    if (!selectionMode) return
    if (selectionBounds() == null) {
      // Scrolled out of the viewport (or collapsed): drop the whole selection
      // so the UI and terminal state never disagree.
      clearSelection()
    } else {
      actionMode?.invalidateContentRect()
    }
  }

  private fun clearSelection() {
    synchronized(vtLock) {
      if (handle != 0L) GhosttyVt.nativeClearSelection(handle)
    }
    selectionMode = false
    draggingHandle = HANDLE_NONE
    pressLink = null
    actionMode?.finish()
    scheduleFrame()
  }

  private fun selectAllContent() {
    val ok = synchronized(vtLock) { handle != 0L && GhosttyVt.nativeSelectAll(handle) }
    if (ok) {
      selectionMode = true
      scheduleFrame()
      if (actionMode == null) startTerminalActionMode() else actionMode?.invalidate()
    }
  }

  private fun setClipboard(text: String) {
    val clipboard = context.getSystemService(ClipboardManager::class.java) ?: return
    try {
      clipboard.setPrimaryClip(ClipData.newPlainText("terminal", text))
    } catch (e: RuntimeException) {
      // A clipboard too large for the binder; nothing to copy then.
    }
  }

  // Copy then give the keyboard back, so typing goes on right away (issue #101).
  private fun copySelection() {
    val bytes = synchronized(vtLock) {
      if (handle == 0L) null else GhosttyVt.nativeSelectionText(handle)
    } ?: return
    val text = String(bytes, Charsets.UTF_8)
    clearSelection()
    post {
      setClipboard(text)
      onCopied?.invoke(text, false)
      requestFocus()
    }
  }

  private fun pasteFromClipboard() {
    if (handle == 0L || finished) return
    val clipboard = context.getSystemService(ClipboardManager::class.java) ?: return
    val clip = clipboard.primaryClip?.takeIf { it.itemCount > 0 } ?: return
    val text = clip.getItemAt(0).coerceToText(context)?.toString()
    if (text.isNullOrEmpty()) return
    if (selectionMode) clearSelection() else actionMode?.finish()
    pasteText(text)
  }

  private fun sendPaste(bytes: ByteArray) {
    val encoded = synchronized(vtLock) {
      if (handle == 0L) null else GhosttyVt.nativeEncodePaste(handle, bytes)
    } ?: return
    if (selectionMode) clearSelection() else actionMode?.finish()
    ime.reset()
    sendBytes(encoded)
  }

  private fun startTerminalActionMode() {
    val current = actionMode
    if (current != null) {
      current.invalidate()
      current.invalidateContentRect()
      return
    }
    actionMode = startActionMode(
      object : ActionMode.Callback2() {
        override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
          menu.add(Menu.NONE, MENU_COPY, 0, android.R.string.copy)
          menu.add(Menu.NONE, MENU_PASTE, 1, android.R.string.paste)
          menu.add(Menu.NONE, MENU_SELECT_ALL, 2, android.R.string.selectAll)
          menu.add(Menu.NONE, MENU_OPEN_LINK, 3, OPEN_LINK_LABEL)
          menu.add(Menu.NONE, MENU_MORE, 4, MORE_LABEL)
          return true
        }

        override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
          menu.findItem(MENU_COPY)?.isVisible = selectionMode
          menu.findItem(MENU_OPEN_LINK)?.isVisible = pressLink != null
          menu.findItem(MENU_MORE)?.isVisible = onMenu != null
          return true
        }

        override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
          when (item.itemId) {
            MENU_COPY -> copySelection()
            MENU_PASTE -> pasteFromClipboard()
            MENU_SELECT_ALL -> selectAllContent()
            MENU_OPEN_LINK -> {
              val link = pressLink
              clearSelection()
              if (link != null) onLink?.invoke(link)
            }
            MENU_MORE -> {
              clearSelection()
              onMenu?.invoke()
            }
            else -> return false
          }
          return true
        }

        override fun onDestroyActionMode(mode: ActionMode) {
          actionMode = null
        }

        override fun onGetContentRect(mode: ActionMode, view: View, outRect: Rect) {
          outRect.set(selectionContentRect())
        }
      },
      ActionMode.TYPE_FLOATING
    )
  }

  private fun selectionContentRect(): Rect {
    val bounds = selectionBounds()
    return if (bounds != null) {
      val (top, topCol, bottom, bottomCol) = bounds
      val singleRow = top == bottom
      Rect(
        if (singleRow) (topCol * cellWidth).toInt() else 0,
        top * cellHeight,
        if (singleRow) ((bottomCol + 1 + selEndExtraCols(bottom)) * cellWidth).toInt() else width,
        (bottom + 1) * cellHeight
      )
    } else {
      Rect(
        (lastPressCol * cellWidth).toInt(),
        lastPressRow * cellHeight,
        ((lastPressCol + 1) * cellWidth).toInt(),
        (lastPressRow + 1) * cellHeight
      )
    }
  }

  /** Returns which handle (start/end) is under the touch, arming the drag anchor. */
  private fun hitTestHandle(x: Float, y: Float): Int {
    val bounds = selectionBounds() ?: return HANDLE_NONE
    val (top, topCol, bottom, bottomCol) = bounds
    val slop = HANDLE_HIT_SLOP_DP * resources.displayMetrics.density
    val startX = topCol * cellWidth
    val startY = (top + 1) * cellHeight + handleRadius
    val endX = (bottomCol + 1 + selEndExtraCols(bottom)) * cellWidth
    val endY = (bottom + 1) * cellHeight + handleRadius
    val distStart = hypot(x - startX, y - startY)
    val distEnd = hypot(x - endX, y - endY)
    return when {
      distEnd <= slop && distEnd <= distStart -> {
        dragAnchorCol = topCol
        dragAnchorRow = top
        dragBiasRows = 1
        HANDLE_END
      }
      distStart <= slop -> {
        dragAnchorCol = bottomCol
        dragAnchorRow = bottom
        dragBiasRows = 1
        HANDLE_START
      }
      else -> HANDLE_NONE
    }
  }

  private fun dragSelection(x: Float, y: Float) {
    val col = colAt(x)
    val row = ((y / cellHeight).toInt() - dragBiasRows).coerceIn(0, rows - 1)
    synchronized(vtLock) {
      if (handle == 0L) return
      GhosttyVt.nativeSetSelection(handle, dragAnchorCol, dragAnchorRow, col, row)
    }
    magnifier?.show(x, y)
    scheduleFrame()
  }

  private fun drawSelectionHandles(canvas: Canvas) {
    if (!selectionMode) return
    val bounds = selectionBounds() ?: return
    val (top, topCol, bottom, bottomCol) = bounds
    handlePaint.color = handleColor
    val stem = max(2f, resources.displayMetrics.density * 2)
    val startX = topCol * cellWidth
    val startTop = ((top + 1) * cellHeight).toFloat()
    canvas.drawRect(startX - stem / 2, startTop - cellHeight / 3f, startX + stem / 2, startTop + handleRadius, handlePaint)
    canvas.drawCircle(startX, startTop + handleRadius, handleRadius, handlePaint)
    val endX = (bottomCol + 1 + selEndExtraCols(bottom)) * cellWidth
    val endTop = ((bottom + 1) * cellHeight).toFloat()
    canvas.drawRect(endX - stem / 2, endTop - cellHeight / 3f, endX + stem / 2, endTop + handleRadius, handlePaint)
    canvas.drawCircle(endX, endTop + handleRadius, handleRadius, handlePaint)
  }

  // ── Cursor blink ──

  private fun wantsBlink(): Boolean {
    return cursorBlinks && cursorVisible && isAttachedToWindow && hasWindowFocus() &&
      Settings.Global.getFloat(
        context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f
      ) != 0f
  }

  private fun syncBlinkTimer() {
    val wants = wantsBlink()
    if (wants && !blinkScheduled) {
      blinkScheduled = true
      postDelayed(blinkRunnable, BLINK_INTERVAL_MS)
    } else if (!wants && blinkScheduled) {
      blinkScheduled = false
      removeCallbacks(blinkRunnable)
      if (!blinkPhaseOn) {
        blinkPhaseOn = true
        invalidate()
      }
    }
  }

  /** Show a solid cursor and restart the blink interval (any input/output). */
  private fun holdBlinkSolid() {
    if (!blinkPhaseOn) {
      blinkPhaseOn = true
      invalidate()
    }
    if (blinkScheduled) {
      removeCallbacks(blinkRunnable)
      postDelayed(blinkRunnable, BLINK_INTERVAL_MS)
    }
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    syncBlinkTimer()
  }

  override fun onFocusChanged(gainFocus: Boolean, direction: Int, previouslyFocusedRect: Rect?) {
    super.onFocusChanged(gainFocus, direction, previouslyFocusedRect)
    if (focusEvents && !finished) GhosttyVt.nativeEncodeFocus(gainFocus)?.let { onInputBytes?.invoke(it) }
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    syncBlinkTimer()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    syncBlinkTimer()
  }

  private fun paintFor(flags: Int, codepoint: Int): Paint = when {
    symbolsPaint != null &&
      (codepoint in PUA_BMP_FIRST..PUA_BMP_LAST || codepoint >= PUA_SUPPLEMENTARY_FIRST) &&
      !textPaint.hasGlyph(String(Character.toChars(codepoint))) ->
      symbolsPaint
    flags and FLAG_BOLD != 0 && flags and FLAG_ITALIC != 0 -> boldItalicPaint
    flags and FLAG_BOLD != 0 -> boldPaint
    flags and FLAG_ITALIC != 0 -> italicPaint
    else -> textPaint
  }

  private fun drawRowRecord(buf: ByteBuffer, canvas: Canvas, snapCols: Int) {
    val rowIndex = buf.int
    val selStart = buf.int
    val selEnd = buf.int
    val textUnits = buf.int
    if (rowIndex < rowSelStart.size) {
      rowSelStart[rowIndex] = selStart
      rowSelEnd[rowIndex] = selEnd
      rowSelEndWide[rowIndex] = false
    }
    val cellsPos = buf.position()
    val textPos = cellsPos + snapCols * CELL_RECORD_BYTES

    buf.position(textPos)
    if (textUnits > rowChars.size) rowChars = CharArray(textUnits)
    for (i in 0 until textUnits) rowChars[i] = buf.char
    val nextRecord = textPos + textUnits * 2 + if (textUnits % 2 != 0) 2 else 0

    buf.position(cellsPos)
    val colCount = minOf(snapCols, cellFg.size)
    for (col in 0 until snapCols) {
      val fg = buf.int
      val bg = buf.int
      val textOff = buf.short.toInt() and 0xFFFF
      val textLen = buf.short.toInt() and 0xFFFF
      val flags = buf.short.toInt() and 0xFFFF
      buf.short // pad
      if (col >= colCount) continue
      if (col == selEnd && flags and FLAG_WIDE != 0 && rowIndex < rowSelEndWide.size) {
        rowSelEndWide[rowIndex] = true
      }
      val selected = selStart >= 0 && col >= selStart && col <= selEnd
      val colors = resolveCellColors(fg, bg, flags, selected, defaultFg, defaultBg, selectionFg, selectionBg)
      cellFg[col] = packedFg(colors)
      cellBg[col] = packedBg(colors)
      cellTextOff[col] = textOff
      cellTextLen[col] = textLen
      cellFlags[col] = flags
    }
    buf.position(nextRecord)
    if (rowIndex < rowText.size) recordRowText(rowIndex, colCount)

    val top = (rowIndex * cellHeight).toFloat()
    val bottom = top + cellHeight

    // Background pass: row clear, then per-cell backgrounds.
    fillPaint.color = defaultBg
    canvas.drawRect(0f, top, canvas.width.toFloat(), bottom, fillPaint)
    for (col in 0 until colCount) {
      val bg = cellBg[col]
      if (bg == defaultBg) continue
      val width = if (cellFlags[col] and FLAG_WIDE != 0) cellWidth * 2 else cellWidth
      val x = col * cellWidth
      fillPaint.color = bg
      canvas.drawRect(x, top, x + width, bottom, fillPaint)
    }

    // Text pass. Runs of plain cells with one style are drawn together so the font can join
    // ligatures, as long as the run still fits the grid; anything else is drawn cell by cell.
    var col = 0
    while (col < colCount) {
      val flags = cellFlags[col]
      val len = cellTextLen[col]
      if (len == 0 || flags and FLAG_SPACER != 0 || flags and FLAG_INVISIBLE != 0) {
        col++
        continue
      }
      val codepoint = Character.codePointAt(rowChars, cellTextOff[col])
      val paint = paintFor(flags, codepoint)
      var end = col + 1
      if (paint !== symbolsPaint && flags and FLAG_WIDE == 0) {
        while (end < colCount && runContinues(col, end, paint)) end++
      }
      paint.color = cellFg[col]
      if (flags and FLAG_FAINT != 0) paint.alpha = 160
      val x = col * cellWidth
      val runChars = cellTextOff[end - 1] + cellTextLen[end - 1] - cellTextOff[col]
      if (end - col > 1 && abs(paint.measureText(rowChars, cellTextOff[col], runChars) - (end - col) * cellWidth) < 0.5f) {
        canvas.drawText(rowChars, cellTextOff[col], runChars, x, top + baseline, paint)
      } else {
        for (c in col until end) {
          canvas.drawText(rowChars, cellTextOff[c], cellTextLen[c], c * cellWidth, top + baseline, paint)
        }
      }
      for (c in col until end) {
        val cFlags = cellFlags[c]
        val cx = c * cellWidth
        val runWidth = if (cFlags and FLAG_WIDE != 0) cellWidth * 2 else cellWidth
        if (cFlags and FLAG_UNDERLINE != 0) {
          canvas.drawRect(cx, bottom - underlineThickness, cx + runWidth, bottom, paint)
        }
        if (cFlags and FLAG_STRIKETHROUGH != 0) {
          val mid = top + cellHeight / 2f
          canvas.drawRect(cx, mid - underlineThickness / 2, cx + runWidth, mid + underlineThickness / 2, paint)
        }
      }
      paint.alpha = 255
      col = end
    }
  }

  private fun runContinues(start: Int, next: Int, paint: Paint): Boolean {
    val flags = cellFlags[next]
    if (cellTextLen[next] != 1 || flags and (FLAG_SPACER or FLAG_INVISIBLE or FLAG_WIDE) != 0) return false
    if (cellFg[next] != cellFg[start] || flags and STYLE_MASK != cellFlags[start] and STYLE_MASK) return false
    // Text of consecutive cells must sit next to each other in the row blob.
    if (cellTextOff[next] != cellTextOff[next - 1] + cellTextLen[next - 1]) return false
    val ch = rowChars[cellTextOff[next]]
    return !Character.isSurrogate(ch) && paintFor(flags, ch.code) === paint
  }

  private fun recordRowText(rowIndex: Int, colCount: Int) {
    val text = StringBuilder(colCount)
    val starts = IntArray(colCount)
    for (col in 0 until colCount) {
      val flags = cellFlags[col]
      if (flags and FLAG_SPACER != 0) {
        starts[col] = -1
        continue
      }
      starts[col] = text.length
      val len = cellTextLen[col]
      if (len == 0 || flags and FLAG_INVISIBLE != 0) text.append(' ') else text.append(rowChars, cellTextOff[col], len)
    }
    rowText[rowIndex] = text.toString()
    rowCellStart[rowIndex] = starts
  }

  private fun viewportLines(): List<String> = rowText.map { it?.trimEnd().orEmpty() }

  override fun onDraw(canvas: Canvas) {
    canvas.drawColor(defaultBg)
    bitmap?.let { canvas.drawBitmap(it, 0f, 0f, null) }
    drawCursor(canvas)
    drawPreedit(canvas)
    drawSelectionHandles(canvas)
    drawScrollIndicator(canvas)
    if (SystemClock.uptimeMillis() < flashUntil) {
      fillPaint.color = defaultFg
      fillPaint.alpha = 50
      canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), fillPaint)
      fillPaint.alpha = 255
    }
  }

  private fun drawScrollIndicator(canvas: Canvas) {
    if (scrollbarTotal <= scrollbarLen) return
    val elapsed = SystemClock.uptimeMillis() - lastScrollActivityAt
    if (elapsed > SCROLLBAR_FADE_END_MS) return
    val alpha = if (elapsed <= SCROLLBAR_FADE_START_MS) {
      255
    } else {
      (255 * (SCROLLBAR_FADE_END_MS - elapsed) / (SCROLLBAR_FADE_END_MS - SCROLLBAR_FADE_START_MS)).toInt()
    }
    val density = resources.displayMetrics.density
    val barWidth = 3 * density
    val right = width - 2 * density
    val trackHeight = height.toFloat()
    val top = trackHeight * scrollbarOffset / scrollbarTotal
    val thumbHeight = max(16 * density, trackHeight * scrollbarLen / scrollbarTotal)
    scrollbarPaint.color = SCROLLBAR_COLOR
    scrollbarPaint.alpha = alpha
    canvas.drawRect(right - barWidth, top, right, (top + thumbHeight).coerceAtMost(trackHeight), scrollbarPaint)
    if (elapsed > SCROLLBAR_FADE_START_MS) invalidate()
  }

  private fun drawCursor(canvas: Canvas) {
    if (!cursorVisible || cursorX < 0 || cursorY < 0) return
    if (cursorBlinks && blinkScheduled && !blinkPhaseOn && hasFocus()) return
    val x = cursorX * cellWidth
    val top = (cursorY * cellHeight).toFloat()
    val bottom = top + cellHeight
    cursorPaint.color = if (cursorColor != 0) cursorColor else defaultFg
    // Without focus the cursor is an outline, like other terminals.
    val style = if (!hasFocus() && cursorStyle == CURSOR_STYLE_BLOCK) CURSOR_STYLE_BLOCK_HOLLOW else cursorStyle
    when (style) {
      CURSOR_STYLE_BAR -> {
        cursorPaint.style = Paint.Style.FILL
        canvas.drawRect(x, top, x + underlineThickness * 2, bottom, cursorPaint)
      }
      CURSOR_STYLE_UNDERLINE -> {
        cursorPaint.style = Paint.Style.FILL
        canvas.drawRect(x, bottom - underlineThickness * 2, x + cellWidth, bottom, cursorPaint)
      }
      CURSOR_STYLE_BLOCK_HOLLOW -> {
        cursorPaint.style = Paint.Style.STROKE
        cursorPaint.strokeWidth = underlineThickness
        canvas.drawRect(x, top, x + cellWidth, bottom, cursorPaint)
      }
      else -> {
        cursorPaint.style = Paint.Style.FILL
        canvas.drawRect(x, top, x + cellWidth, bottom, cursorPaint)
        // Redraw the character under a solid block in the accent color.
        val text = rowText.getOrNull(cursorY)
        val starts = rowCellStart.getOrNull(cursorY)
        if (text != null && starts != null && cursorX < starts.size && starts[cursorX] >= 0) {
          val start = starts[cursorX]
          val end = (cursorX + 1 until starts.size).map { starts[it] }.firstOrNull { it >= 0 } ?: text.length
          val ch = text.substring(start, end)
          if (ch.isNotBlank()) {
            textPaint.color = cursorAccent ?: defaultBg
            canvas.drawText(ch, x, top + baseline, textPaint)
          }
        }
      }
    }
  }

  private fun drawPreedit(canvas: Canvas) {
    val text = ime.preedit
    if (text.isEmpty() || cursorX < 0 || cursorY < 0) return
    val x = cursorX * cellWidth
    val top = (cursorY * cellHeight).toFloat()
    val w = preeditPaint.measureText(text)
    fillPaint.color = defaultBg
    canvas.drawRect(x, top, x + w, top + cellHeight, fillPaint)
    preeditPaint.color = defaultFg
    canvas.drawText(text, x, top + baseline, preeditPaint)
    canvas.drawRect(x, top + cellHeight - underlineThickness, x + w, top + cellHeight, preeditPaint)
  }

  // ── Accessibility ──

  private fun screenReaderOn(): Boolean =
    context.getSystemService(AccessibilityManager::class.java)?.isTouchExplorationEnabled == true

  // The cursor row, or the last row with text when the cursor is unknown.
  private fun reportPromptLine() {
    if (destroyed || !promptWatch) return
    val line = (rowText.getOrNull(cursorY) ?: rowText.lastOrNull { !it.isNullOrBlank() })
      ?.trimEnd().orEmpty()
    if (line == lastPromptLine) return
    lastPromptLine = line
    onPromptLine?.invoke(line)
  }

  private fun announceOutput() {
    val now = viewportLines()
    val fresh = OutputAnnouncer.newLines(announcedLines, now)
    announcedLines = now
    if (fresh.isNotEmpty()) {
      @Suppress("DEPRECATION")
      announceForAccessibility(fresh.joinToString("\n"))
    }
  }

  override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
    super.onInitializeAccessibilityNodeInfo(info)
    info.className = "android.widget.EditText"
    info.isEditable = true
    info.text = viewportLines().joinToString("\n").trimEnd()
  }

  // ── Input ──

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) scroller.abortAnimation()
    scaleDetector.onTouchEvent(event)
    if (scaleDetector.isInProgress) {
      if (draggingHandle != HANDLE_NONE) {
        draggingHandle = HANDLE_NONE
        magnifier?.dismiss()
      }
      // Keep the tap/long-press detector's stream consistent; its callbacks
      // are guarded on isInProgress.
      gestureDetector.onTouchEvent(event)
      return true
    }
    if (selectionMode) {
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          draggingHandle = hitTestHandle(event.x, event.y)
          if (draggingHandle != HANDLE_NONE) {
            // Hide the toolbar while dragging; it comes back on release.
            actionMode?.finish()
            return true
          }
        }
        MotionEvent.ACTION_MOVE -> if (draggingHandle != HANDLE_NONE) {
          dragSelection(event.x, event.y)
          return true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL ->
          if (draggingHandle != HANDLE_NONE) {
            draggingHandle = HANDLE_NONE
            magnifier?.dismiss()
            startTerminalActionMode()
            return true
          }
      }
    }
    return gestureDetector.onTouchEvent(event) || super.onTouchEvent(event)
  }

  override fun onCheckIsTextEditor(): Boolean = true

  override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection {
    // Plain text with no suggestions: Japanese, Chinese and Korean keyboards and voice typing
    // work (a password field turns them off), and no caps flag means no capital first letter.
    outAttrs.inputType = InputType.TYPE_CLASS_TEXT or
      InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or
      InputType.TYPE_TEXT_FLAG_MULTI_LINE
    outAttrs.imeOptions = EditorInfo.IME_ACTION_NONE or
      EditorInfo.IME_FLAG_NO_FULLSCREEN or
      EditorInfo.IME_FLAG_NO_EXTRACT_UI or
      EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING
    outAttrs.initialCapsMode = 0
    val before = ime.textBeforeCursor(IME_CONTEXT)
    outAttrs.initialSelStart = before.length
    outAttrs.initialSelEnd = before.length
    cjkKeyboard = isCjkKeyboard()
    return TerminalInputConnection()
  }

  private fun isCjkKeyboard(): Boolean {
    val imm = context.getSystemService(InputMethodManager::class.java) ?: return false
    val tag = try {
      imm.currentInputMethodSubtype?.languageTag.orEmpty()
    } catch (e: RuntimeException) {
      ""
    }
    return tag.startsWith("ja") || tag.startsWith("zh") || tag.startsWith("ko")
  }

  private fun syncImeSelection() {
    val imm = context.getSystemService(InputMethodManager::class.java) ?: return
    val before = ime.textBeforeCursor(IME_CONTEXT).length
    imm.updateSelection(this, before, before, -1, -1)
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    return handleKeyEvent(event) || super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    return handleKeyEvent(event) || super.onKeyUp(keyCode, event)
  }

  internal fun handleKeyEvent(event: KeyEvent): Boolean {
    if (handle == 0L || finished) return false
    @Suppress("DEPRECATION")
    if (event.action == KeyEvent.ACTION_MULTIPLE && event.characters != null) {
      sendText(event.characters)
      return true
    }
    val action = when (event.action) {
      KeyEvent.ACTION_DOWN -> if (event.repeatCount > 0) 2 else 1
      KeyEvent.ACTION_UP -> 0
      else -> return false
    }
    onShortcut?.let { report ->
      Shortcuts.idFor(event)?.let { id ->
        report(id)
        return true
      }
    }
    if (action == 1 && event.isCtrlPressed && event.isShiftPressed) {
      when (event.keyCode) {
        KeyEvent.KEYCODE_C -> {
          copySelection()
          return true
        }
        KeyEvent.KEYCODE_V -> {
          pasteFromClipboard()
          return true
        }
      }
    }
    if (action == 1 && !KeyEvent.isModifierKey(event.keyCode)) ime.reset()
    // Sticky key row modifiers apply to hardware keys too.
    val stickyMeta = if (action == 1) stickyMeta() else 0
    if (stickyMeta != 0) consumeSticky()
    var metaState = event.metaState or stickyMeta
    // AltGr types symbols on many layouts, so it is not Alt for the shell.
    val altGr = metaState and KeyEvent.META_ALT_RIGHT_ON != 0 && metaState and KeyEvent.META_ALT_LEFT_ON == 0
    if (altGr) metaState = metaState and (KeyEvent.META_ALT_ON or KeyEvent.META_ALT_RIGHT_ON).inv()
    val charMeta = if (altGr) {
      event.metaState and (KeyEvent.META_CTRL_MASK or KeyEvent.META_META_MASK).inv()
    } else {
      metaState and (KeyEvent.META_CTRL_MASK or KeyEvent.META_META_MASK or KeyEvent.META_ALT_MASK).inv()
    }
    val unicode = event.getUnicodeChar(charMeta)
    val utf8 = if (unicode != 0 && unicode and KeyCharacterMap.COMBINING_ACCENT == 0) {
      String(Character.toChars(unicode)).toByteArray(Charsets.UTF_8)
    } else {
      null
    }
    val unshifted = event.getUnicodeChar(0)
    val bytes = encodeKey(event.keyCode, action, metaState, unshifted, utf8) ?: return false
    if (bytes.isEmpty()) return false
    sendBytes(bytes)
    return true
  }

  private inner class TerminalInputConnection :
    BaseInputConnection(this@GhosttyTerminalView, false) {
    private fun apply(edit: ImeShadow.Edit) {
      applyEdit(edit)
      syncImeSelection()
      invalidate()
    }

    override fun getTextBeforeCursor(n: Int, flags: Int): CharSequence = ime.textBeforeCursor(n)

    override fun getTextAfterCursor(n: Int, flags: Int): CharSequence = ""

    override fun getSelectedText(flags: Int): CharSequence? = null

    // Never ask the keyboard for a capital letter (issue #93).
    override fun getCursorCapsMode(reqModes: Int): Int = 0

    override fun setComposingText(text: CharSequence, newCursorPosition: Int): Boolean {
      if (!ime.hasComposing()) cjkKeyboard = isCjkKeyboard()
      val value = text.toString()
      apply(ime.setComposing(value, ImeShadow.needsPreedit(value, cjkKeyboard)))
      return true
    }

    // Re-composing an earlier word would need the shell's line; keep typing where we are.
    override fun setComposingRegion(start: Int, end: Int): Boolean = true

    override fun finishComposingText(): Boolean {
      apply(ime.finishComposing())
      return true
    }

    override fun commitText(text: CharSequence, newCursorPosition: Int): Boolean {
      val value = text.toString()
      if (value == "\n" && !ime.hasComposing()) {
        ime.commit(value)
        sendEnter()
        syncImeSelection()
        return true
      }
      apply(ime.commit(value))
      return true
    }

    override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
      val before = ime.textBeforeCursor(beforeLength)
      val known = ImeShadow.codePoints(before)
      // Units the keyboard counted beyond what it knows are one character each.
      apply(ime.deleteBefore(known + max(0, beforeLength - before.length)))
      return true
    }

    override fun deleteSurroundingTextInCodePoints(beforeLength: Int, afterLength: Int): Boolean {
      apply(ime.deleteBefore(beforeLength))
      return true
    }

    override fun performEditorAction(actionCode: Int): Boolean {
      apply(ime.finishComposing())
      ime.reset()
      sendEnter()
      return true
    }

    override fun sendKeyEvent(event: KeyEvent): Boolean {
      if (handleKeyEvent(event)) return true
      return super.sendKeyEvent(event)
    }
  }

  private companion object {
    const val FONT_SIZE_DP = 14f
    const val MIN_FONT_SIZE_DP = 4f
    const val MAX_FONT_SIZE_DP = 64f
    const val PINCH_SCALE_STEP = 0.1f
    const val INITIAL_COLS = 80
    const val INITIAL_ROWS = 24
    const val DEFAULT_SCROLLBACK = 10_000L
    const val BLINK_INTERVAL_MS = 600L
    const val SYMBOLS_FONT_ASSET = "SymbolsNerdFontMono-Regular.ttf"
    const val DEFAULT_FONT = "CaskaydiaCove NFM"
    const val SYSTEM_FONT = "monospace"
    const val LIGATURES = "'liga' on, 'calt' on"
    const val IME_CONTEXT = 256

    const val PARSE_SLICE = 64 * 1024
    const val PARSE_BUDGET_MS = 12L
    // Set on our side after a parse, next to ghostty's own event bits.
    const val EVENT_OUTPUT = 1 shl 16

    const val ANNOUNCE_DELAY_MS = 500L
    const val PROMPT_DELAY_MS = 150L
    const val BELL_MIN_GAP_MS = 150L
    const val BELL_FLASH_MS = 120L
    const val BELL_TONE_MS = 80
    const val BELL_VOLUME = 40

    // Nerd Font glyph ranges: BMP private-use area plus the supplementary
    // private-use planes (material icons live at U+F0000+ since v3).
    const val PUA_BMP_FIRST = 0xE000
    const val PUA_BMP_LAST = 0xF8FF
    const val PUA_SUPPLEMENTARY_FIRST = 0xF0000

    const val STYLE_MASK = FLAG_BOLD or FLAG_ITALIC or FLAG_FAINT or FLAG_UNDERLINE or FLAG_STRIKETHROUGH

    const val HANDLE_NONE = 0
    const val HANDLE_START = 1
    const val HANDLE_END = 2
    const val HANDLE_RADIUS_DP = 8f
    const val HANDLE_HIT_SLOP_DP = 24f
    const val HANDLE_COLOR = 0xFF4C8DF5.toInt()

    const val MOUSE_PRESS = 0
    const val MOUSE_RELEASE = 1
    const val MOUSE_LEFT = 1
    const val MOUSE_WHEEL_UP = 4
    const val MOUSE_WHEEL_DOWN = 5

    const val MENU_COPY = 1
    const val MENU_PASTE = 2
    const val MENU_SELECT_ALL = 3
    const val MENU_OPEN_LINK = 4
    const val OPEN_LINK_LABEL = "Open link"
    const val MENU_MORE = 5
    const val MORE_LABEL = "More"

    const val SCROLLBAR_FADE_START_MS = 800L
    const val SCROLLBAR_FADE_END_MS = 1400L
    const val SCROLLBAR_COLOR = 0xB3AAAAAA.toInt()

    val NAMED_KEYS = mapOf(
      "Escape" to KeyEvent.KEYCODE_ESCAPE,
      "Tab" to KeyEvent.KEYCODE_TAB,
      "Enter" to KeyEvent.KEYCODE_ENTER,
      "Backspace" to KeyEvent.KEYCODE_DEL,
      "Delete" to KeyEvent.KEYCODE_FORWARD_DEL,
      "Insert" to KeyEvent.KEYCODE_INSERT,
      "ArrowUp" to KeyEvent.KEYCODE_DPAD_UP,
      "ArrowDown" to KeyEvent.KEYCODE_DPAD_DOWN,
      "ArrowLeft" to KeyEvent.KEYCODE_DPAD_LEFT,
      "ArrowRight" to KeyEvent.KEYCODE_DPAD_RIGHT,
      "Home" to KeyEvent.KEYCODE_MOVE_HOME,
      "End" to KeyEvent.KEYCODE_MOVE_END,
      "PageUp" to KeyEvent.KEYCODE_PAGE_UP,
      "PageDown" to KeyEvent.KEYCODE_PAGE_DOWN,
    ) + (1..12).associate { "F$it" to KeyEvent.KEYCODE_F1 + it - 1 }
  }
}
