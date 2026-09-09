package expo.modules.termixwidgets

import android.graphics.Color
import android.text.format.DateUtils

/**
 * Colour + formatting helpers shared by both providers.
 *
 * Mirrors the iOS widget palette (`ios/widget/WidgetTheme.swift`) which in turn
 * mirrors `app/constants/designTokens.ts`, so a Termix widget looks the same on
 * either platform.
 */
object WidgetTheme {
  const val TEXT_PRIMARY = 0xFFFAFAFA.toInt()
  const val TEXT_SECONDARY = 0xFFA4A4A4.toInt()
  const val TEXT_TERTIARY = 0xFF737373.toInt()

  const val ONLINE = 0xFF4ADE80.toInt()
  const val OFFLINE = 0xFFFF6467.toInt()
  const val UNKNOWN = 0xFF737373.toInt()

  const val TRACK = 0xFF3A3A3A.toInt()
  const val WARN = 0xFFF5C542.toInt()

  const val FALLBACK_ACCENT = 0xFFF59145.toInt()

  /** Parses `#rrggbb`, falling back to the brand accent for anything invalid. */
  fun parseAccent(hex: String?): Int {
    if (hex.isNullOrBlank()) return FALLBACK_ACCENT
    return runCatching { Color.parseColor(hex.trim()) }.getOrDefault(FALLBACK_ACCENT)
  }

  fun statusColor(status: HostStatus): Int = when (status) {
    HostStatus.ONLINE -> ONLINE
    HostStatus.OFFLINE -> OFFLINE
    HostStatus.UNKNOWN -> UNKNOWN
  }

  /** Calm below 60%, warm to 85%, hot above — matches the iOS bars. */
  fun loadColor(percent: Int, accent: Int): Int = when {
    percent < 60 -> accent
    percent < 85 -> WARN
    else -> OFFLINE
  }

  /** Compact freshness label ("now", "4m", "2h", "3d"). */
  fun relativeAge(updatedAt: Long, now: Long = System.currentTimeMillis()): String {
    val elapsed = (now - updatedAt).coerceAtLeast(0)
    return when {
      elapsed < DateUtils.MINUTE_IN_MILLIS -> "now"
      elapsed < DateUtils.HOUR_IN_MILLIS -> "${elapsed / DateUtils.MINUTE_IN_MILLIS}m"
      elapsed < DateUtils.DAY_IN_MILLIS -> "${elapsed / DateUtils.HOUR_IN_MILLIS}h"
      else -> "${elapsed / DateUtils.DAY_IN_MILLIS}d"
    }
  }
}
