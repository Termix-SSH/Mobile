package expo.modules.termixwidgets

import android.content.Context
import android.graphics.Color
import android.text.format.DateUtils

/**
 * Colour + formatting helpers shared by both providers.
 *
 * Mirrors the iOS widget palette (`ios/widget/WidgetTheme.swift`) which in turn
 * mirrors `src/constants/theme.ts`, so a Termix widget looks the same on
 * either platform.
 */
/** What a widget draws with: text colors plus the background and card drawables. */
data class Chrome(
  val textPrimary: Int,
  val textSecondary: Int,
  val textTertiary: Int,
  val track: Int,
  val background: Int,
  val card: Int
)

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

  /**
   * Colors and drawables for the app theme in the snapshot. A theme with no
   * drawable in this build (a newer app) or no theme at all keeps the dark look.
   */
  fun chrome(context: Context, palette: WidgetPalette?): Chrome {
    val default = Chrome(
      textPrimary = TEXT_PRIMARY,
      textSecondary = TEXT_SECONDARY,
      textTertiary = TEXT_TERTIARY,
      track = TRACK,
      background = R.drawable.termix_widget_background,
      card = R.drawable.termix_widget_card
    )
    if (palette == null) return default

    val name = palette.id.replace('-', '_')
    val background = drawableId(context, "termix_widget_background_$name")
    val card = drawableId(context, "termix_widget_card_$name")
    if (background == 0 || card == 0) return default

    return Chrome(
      textPrimary = parseHex(palette.text, TEXT_PRIMARY),
      textSecondary = parseHex(palette.textSecondary, TEXT_SECONDARY),
      textTertiary = parseHex(palette.textTertiary, TEXT_TERTIARY),
      track = parseHex(palette.border, TRACK),
      background = background,
      card = card
    )
  }

  private fun drawableId(context: Context, name: String): Int =
    context.resources.getIdentifier(name, "drawable", context.packageName)

  /** Parses `#rrggbb` or the CSS style `#rrggbbaa` (the snapshot's text colors). */
  fun parseHex(hex: String?, fallback: Int): Int {
    val value = hex?.trim()?.removePrefix("#") ?: return fallback
    val argb = when (value.length) {
      6 -> "FF$value"
      8 -> value.substring(6) + value.substring(0, 6)
      else -> return fallback
    }
    return runCatching { Color.parseColor("#$argb") }.getOrDefault(fallback)
  }

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

  /** Calm below 60%, warm to 85%, hot above - matches the iOS bars. */
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
