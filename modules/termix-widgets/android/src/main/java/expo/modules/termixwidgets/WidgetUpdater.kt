package expo.modules.termixwidgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

/**
 * Pushes a redraw to every placed Termix widget.
 *
 * Collection widgets need two signals: the adapter data must be invalidated
 * (`notifyAppWidgetViewDataChanged`) *and* the host chrome (header, footer,
 * accent) re-rendered by the provider.
 */
object WidgetUpdater {
  fun updateAll(context: Context) {
    val appContext = context.applicationContext
    val manager = AppWidgetManager.getInstance(appContext) ?: return

    updateProvider(appContext, manager, QuickConnectWidgetProvider::class.java, R.id.termix_widget_grid)
    updateProvider(appContext, manager, StatusWidgetProvider::class.java, R.id.termix_widget_list)
    updateProvider(
      appContext,
      manager,
      SnippetsWidgetProvider::class.java,
      R.id.termix_widget_snippet_list
    )
  }

  private fun <T : TermixWidgetProvider> updateProvider(
    context: Context,
    manager: AppWidgetManager,
    provider: Class<T>,
    collectionViewId: Int
  ) {
    val ids = runCatching {
      manager.getAppWidgetIds(ComponentName(context, provider))
    }.getOrNull() ?: return
    if (ids.isEmpty()) return

    // Refresh the scrolling rows first, then the surrounding chrome.
    manager.notifyAppWidgetViewDataChanged(ids, collectionViewId)

    val instance = runCatching { provider.getDeclaredConstructor().newInstance() }.getOrNull()
      ?: return
    instance.onUpdate(context, manager, ids)
  }
}
