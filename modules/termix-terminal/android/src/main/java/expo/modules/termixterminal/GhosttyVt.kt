package expo.modules.termixterminal

import java.nio.ByteBuffer

/**
 * JNI bindings for libghostty-vt (see src/main/cpp/ghostty_jni.cpp).
 *
 * The native side keeps per-handle state without locking, so callers hold the
 * view's lock around every call that takes a handle.
 */
internal object GhosttyVt {
  /** libghostty-vt is built for arm64-v8a and x86_64 only, so 32 bit phones have none. */
  val loaded: Boolean = try {
    System.loadLibrary("termixterminal")
    true
  } catch (e: UnsatisfiedLinkError) {
    false
  }

  // Event flags returned by nativeTakeEventFlags; mirror ghostty_jni.cpp.
  const val EVENT_BELL = 1
  const val EVENT_TITLE = 1 shl 1
  const val EVENT_PWD = 1 shl 2
  const val EVENT_CLIPBOARD = 1 shl 3

  // Cursor styles for nativeSetDefaultCursor, ghostty's GhosttyTerminalCursorStyle.
  const val CURSOR_BAR = 0
  const val CURSOR_BLOCK = 1
  const val CURSOR_UNDERLINE = 2

  /** Create a terminal session. Returns 0 on failure. */
  external fun nativeCreate(cols: Int, rows: Int, maxScrollback: Long): Long

  external fun nativeFree(handle: Long)

  /**
   * Feed PTY output bytes through the VT parser. Returns query-response bytes
   * the terminal wants written back to the PTY (DSR etc.), or null.
   */
  external fun nativeWrite(handle: Long, data: ByteArray): ByteArray?

  external fun nativeResize(handle: Long, cols: Int, rows: Int, cellWidthPx: Int, cellHeightPx: Int)

  /** EVENT_* flags for effects observed since the last call; clears on read. */
  external fun nativeTakeEventFlags(handle: Long): Int

  /** Terminal title set via OSC 0/2 as UTF-8, or null when unset. */
  external fun nativeGetTitle(handle: Long): ByteArray?

  /** Working directory set via OSC 7/9/1337 as UTF-8, or null when unset. */
  external fun nativeGetPwd(handle: Long): ByteArray?

  /**
   * Set the terminal's default colors. Colors use ghostty config syntax
   * (hex with or without '#', X11 names); null clears back to the built-in
   * default, invalid strings are logged and skipped. [palette] overrides
   * entries by index on top of ghostty's default 256-color palette.
   */
  external fun nativeSetTheme(
    handle: Long,
    foreground: String?,
    background: String?,
    cursor: String?,
    palette: Array<String?>?
  )

  /** Parse a ghostty-syntax color to ARGB, or 0 when invalid. */
  external fun nativeParseColor(color: String): Int

  /** Scroll the viewport by [deltaRows]; negative is up (into scrollback). */
  external fun nativeScroll(handle: Long, deltaRows: Int)

  external fun nativeScrollToBottom(handle: Long)

  /** Viewport scrollbar as [total, offset, len] rows, or null. */
  external fun nativeScrollbar(handle: Long): LongArray?

  /**
   * Update the render state and flatten dirty rows into [buffer] (direct,
   * little-endian; layout documented in ghostty_jni.cpp). Returns the number
   * of row records written, or -1 on error/too-small buffer.
   */
  external fun nativeSnapshot(handle: Long, buffer: ByteBuffer): Int

  /**
   * Encode a key event ([action]: 0 release / 1 press / 2 repeat) into the
   * escape-sequence bytes to send to the PTY, or null when the key encodes
   * to nothing under the terminal's active modes.
   */
  external fun nativeEncodeKey(
    handle: Long,
    keyCode: Int,
    action: Int,
    metaState: Int,
    unshiftedCodepoint: Int,
    utf8: ByteArray?
  ): ByteArray?

  /** Select the word at a viewport cell; false when there is nothing there. */
  external fun nativeSelectWord(handle: Long, col: Int, row: Int): Boolean

  external fun nativeSelectAll(handle: Long): Boolean

  /** Install a linear selection between two viewport cells (inclusive). */
  external fun nativeSetSelection(
    handle: Long,
    anchorCol: Int,
    anchorRow: Int,
    col: Int,
    row: Int
  ): Boolean

  external fun nativeClearSelection(handle: Long)

  /** Active selection as UTF-8 (plain, unwrapped, trimmed), or null if none. */
  external fun nativeSelectionText(handle: Long): ByteArray?

  /** Conservative check: newlines / bracketed-paste escapes are unsafe. */
  external fun nativeIsPasteSafe(data: ByteArray): Boolean

  /** Encode clipboard bytes for the PTY (control-byte strip + mode-2004 wrap). */
  external fun nativeEncodePaste(handle: Long, data: ByteArray): ByteArray?

  /**
   * Encodes a mouse event for the program's current tracking mode and format.
   * Returns null when mouse tracking is off. Positions are view pixels.
   */
  external fun nativeEncodeMouse(
    handle: Long,
    action: Int,
    button: Int,
    x: Float,
    y: Float,
    widthPx: Int,
    heightPx: Int,
    cellWidthPx: Int,
    cellHeightPx: Int
  ): ByteArray?

  /** Text a program copied with OSC 52 as UTF-8, or null. Clears on read. */
  external fun nativeTakeClipboard(handle: Long): ByteArray?

  /** OSC 8 link of a viewport cell as UTF-8, or null. */
  external fun nativeHyperlinkAt(handle: Long, col: Int, row: Int): ByteArray?

  /** The cursor shown until a program picks its own (DECSCUSR), applied now. */
  external fun nativeSetDefaultCursor(handle: Long, style: Int, blink: Boolean)

  /** [mouse tracking, alt screen, alt scroll, focus events], each 0 or 1. */
  external fun nativeModes(handle: Long): IntArray?

  /** Focus in or out report, for programs that turned on mode 1004. */
  external fun nativeEncodeFocus(focused: Boolean): ByteArray?

  /** Scrollback and screen as UTF-8, one line per screen row, for search. */
  external fun nativeScreenText(handle: Long): ByteArray?

  /** Selects cells startCol..endCol of one screen row (scrollback counts). */
  external fun nativeSelectScreenRange(handle: Long, row: Int, startCol: Int, endCol: Int): Boolean
}
