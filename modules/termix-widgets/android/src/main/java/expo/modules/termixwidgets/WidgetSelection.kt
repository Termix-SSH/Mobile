package expo.modules.termixwidgets


import android.content.Context

/**
 * Per-widget host choice made in the configuration screen.
 *
 * Unlike the snapshot, which is one payload shared by every widget, this is
 * keyed by `appWidgetId` so two Server Status widgets can watch two different
 * hosts. A widget with no stored choice keeps the automatic ordering.
 */
object WidgetSelection {
  private const val PREFERENCES_NAME = "termix_widget_selection"
  private const val KEY_PREFIX = "host_for_widget_"
  private const val SESSION_KEY_PREFIX = "session_for_widget_"

  /** Sentinel meaning "no specific host", stored as an absent key. */
  const val NO_HOST = -1

  private fun preferences(context: Context) =
    context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun hostId(context: Context, appWidgetId: Int): Int =
    runCatching { preferences(context).getInt(KEY_PREFIX + appWidgetId, NO_HOST) }
      .getOrDefault(NO_HOST)

  fun setHostId(context: Context, appWidgetId: Int, hostId: Int) {
    val editor = preferences(context).edit()
    if (hostId == NO_HOST) {
      editor.remove(KEY_PREFIX + appWidgetId)
    } else {
      editor.putInt(KEY_PREFIX + appWidgetId, hostId)
    }
    editor.apply()
  }

  /** Which tab this widget's tiles open. */
  fun sessionKind(context: Context, appWidgetId: Int, fallback: SessionKind): SessionKind =
    runCatching {
      val stored = preferences(context).getString(SESSION_KEY_PREFIX + appWidgetId, null)
      if (stored == null) fallback else SessionKind.from(stored)
    }.getOrDefault(fallback)

  fun setSessionKind(context: Context, appWidgetId: Int, session: SessionKind) {
    preferences(context).edit()
      .putString(SESSION_KEY_PREFIX + appWidgetId, session.slug)
      .apply()
  }

  /**
   * Drops the choices of deleted widgets. Without this the preferences file
   * grows every time a widget is added and removed, and a recycled widget id
   * would inherit a stale host.
   */
  fun forget(context: Context, appWidgetIds: IntArray) {
    val editor = preferences(context).edit()
    appWidgetIds.forEach {
      editor.remove(KEY_PREFIX + it)
      editor.remove(SESSION_KEY_PREFIX + it)
    }
    editor.apply()
  }

  /**
   * Reorders a snapshot so the widget's chosen host leads.
   *
   * Reordering rather than filtering keeps the multi-row families full, and a
   * choice naming a host that has since been deleted falls back to the normal
   * ordering rather than rendering an empty widget.
   */
  fun prioritize(hosts: List<HostEntry>, hostId: Int): List<HostEntry> {
    if (hostId == NO_HOST) return hosts
    if (hosts.none { it.id == hostId }) return hosts
    return hosts.filter { it.id == hostId } + hosts.filter { it.id != hostId }
  }

  /** True when this widget has a live host choice. */
  fun hasChoice(hosts: List<HostEntry>, hostId: Int): Boolean =
    hostId != NO_HOST && hosts.any { it.id == hostId }

  /**
   * Drops every stored choice.
   *
   * Called on sign-out and when the server changes. Host ids are assigned by
   * the backend and restart per server, so a choice made against one account
   * could otherwise silently bind to an unrelated host with the same id after
   * signing into another.
   */
  fun clearAll(context: Context) {
    runCatching { preferences(context).edit().clear().apply() }
  }
}
