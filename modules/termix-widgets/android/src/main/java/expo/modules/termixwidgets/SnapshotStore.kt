package expo.modules.termixwidgets

import android.content.Context
import android.content.SharedPreferences

/**
 * Shared storage between the app process and the widget host process.
 *
 * SharedPreferences is the Android counterpart of the iOS App Group container:
 * both processes belong to the same app, so a plain private preferences file is
 * all that is needed — and unlike a content provider it needs no exported
 * surface.
 */
object SnapshotStore {
  /** Must match the container id reported by the JS module. */
  const val PREFERENCES_NAME = "termix_widgets"

  /** Must match `TermixWidgetsModule.snapshotKey` on iOS and the TS layer. */
  private const val SNAPSHOT_KEY = "termix.widget.snapshot.v1"

  private fun preferences(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun write(context: Context, json: String) {
    preferences(context).edit().putString(SNAPSHOT_KEY, json).apply()
  }

  fun clear(context: Context) {
    preferences(context).edit().remove(SNAPSHOT_KEY).apply()
  }

  fun read(context: Context): WidgetSnapshot =
    WidgetSnapshot.parse(
      runCatching { preferences(context).getString(SNAPSHOT_KEY, null) }.getOrNull()
    )
}
