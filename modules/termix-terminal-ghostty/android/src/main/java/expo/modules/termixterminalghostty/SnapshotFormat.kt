package expo.modules.termixterminalghostty

import java.nio.ByteBuffer

// Snapshot wire format between ghostty_jni.cpp and the Kotlin renderer.
// Every constant here must mirror the C++ writer; the buffer is
// little-endian (see allocateGridBuffers).

internal const val HEADER_BYTES = 52
internal const val ROW_HEADER_BYTES = 16
internal const val CELL_RECORD_BYTES = 16
internal const val MAX_CELL_TEXT_UNITS = 32

internal const val DIRTY_FULL = 2

internal const val CURSOR_STYLE_BAR = 0
internal const val CURSOR_STYLE_BLOCK = 1
internal const val CURSOR_STYLE_UNDERLINE = 2
internal const val CURSOR_STYLE_BLOCK_HOLLOW = 3

internal const val FLAG_BOLD = 1 shl 0
internal const val FLAG_ITALIC = 1 shl 1
internal const val FLAG_FAINT = 1 shl 2
internal const val FLAG_UNDERLINE = 1 shl 3
internal const val FLAG_STRIKETHROUGH = 1 shl 4
internal const val FLAG_INVERSE = 1 shl 5
internal const val FLAG_INVISIBLE = 1 shl 6
internal const val FLAG_WIDE = 1 shl 7
internal const val FLAG_SPACER = 1 shl 8
internal const val FLAG_FG_DEFAULT = 1 shl 9
internal const val FLAG_BG_NONE = 1 shl 10

/** Snapshot header, 13×i32 (version 2). */
internal data class SnapshotHeader(
  val version: Int,
  val dirtyKind: Int,
  val cols: Int,
  val rows: Int,
  val background: Int,
  val foreground: Int,
  val cursorX: Int,
  val cursorY: Int,
  val cursorStyle: Int,
  val cursorVisible: Boolean,
  val rowCount: Int,
  val cursorBlinks: Boolean,
  /** ARGB; 0 = unconfigured (renderer falls back to the foreground). */
  val cursorColor: Int,
) {
  companion object {
    /** Reads the header from the buffer's current position. */
    fun read(buf: ByteBuffer): SnapshotHeader = SnapshotHeader(
      version = buf.int,
      dirtyKind = buf.int,
      cols = buf.int,
      rows = buf.int,
      background = buf.int,
      foreground = buf.int,
      cursorX = buf.int,
      cursorY = buf.int,
      cursorStyle = buf.int,
      cursorVisible = buf.int != 0,
      rowCount = buf.int,
      cursorBlinks = buf.int != 0,
      cursorColor = buf.int,
    )
  }
}

/**
 * Resolves a cell's effective colors from its record: default-color flags,
 * SGR inverse, then selection (themed colors, or the classic fg/bg swap when
 * the theme sets none). Packed as (fg shl 32) or bg to keep the render loop
 * allocation-free; unpack with [packedFg]/[packedBg].
 */
internal fun resolveCellColors(
  fg: Int,
  bg: Int,
  flags: Int,
  selected: Boolean,
  defaultFg: Int,
  defaultBg: Int,
  selectionFg: Int?,
  selectionBg: Int?,
): Long {
  var effFg = if (flags and FLAG_FG_DEFAULT != 0) defaultFg else fg
  var effBg = if (flags and FLAG_BG_NONE != 0) defaultBg else bg
  if (flags and FLAG_INVERSE != 0) {
    val tmp = effFg
    effFg = effBg
    effBg = tmp
  }
  if (selected) {
    if (selectionBg != null) {
      effBg = selectionBg
      if (selectionFg != null) effFg = selectionFg
    } else {
      val tmp = effFg
      effFg = effBg
      effBg = tmp
    }
  }
  return (effFg.toLong() shl 32) or (effBg.toLong() and 0xFFFFFFFFL)
}

internal fun packedFg(packed: Long): Int = (packed ushr 32).toInt()

internal fun packedBg(packed: Long): Int = packed.toInt()
