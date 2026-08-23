package expo.modules.termixwidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews

/**
 * Shared chrome for every widget kind: header, summary, footer, empty state and
 * the collection adapter wiring. Subclasses declare which layout and collection
 * view they use, plus the copy that differs (wordmark, empty-state subject).
 *
 * Rendering never reads the network and never blocks: the snapshot is a small
 * JSON blob in shared preferences, written by the app.
 */
abstract class TermixWidgetProvider : AppWidgetProvider() {
  protected abstract val layoutId: Int
  protected abstract val collectionViewId: Int
  protected abstract val collectionKind: String

  /** Word shown next to the accent block. */
  protected open val wordmark: String = "TERMIX"

  /** What this widget lists — used in the empty-state copy. */
  protected open val emptySubject: String = "hosts"

  /** Where a tap on the header (or empty state) lands in the app. */
  protected open val headerUri: Uri = WidgetSnapshot.FALLBACK_URI

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    appWidgetIds.forEach { widgetId ->
      runCatching { render(context, appWidgetManager, widgetId) }
    }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle?
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    runCatching { render(context, appWidgetManager, appWidgetId) }
  }

  protected open fun render(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int
  ) {
    val snapshot = SnapshotStore.read(context)
    val accent = WidgetTheme.parseAccent(snapshot.accent)
    val views = RemoteViews(context.packageName, layoutId)

    renderHeader(views, snapshot, accent)
    renderFooter(views, snapshot)
    renderEmptyState(views, snapshot, accent)
    views.setOnClickPendingIntent(
      R.id.termix_widget_empty,
      WidgetLinks.openApp(context, appWidgetId, headerUri)
    )
    bindCollection(context, views, appWidgetId)

    views.setOnClickPendingIntent(
      R.id.termix_widget_header,
      WidgetLinks.openApp(context, appWidgetId, headerUri)
    )

    appWidgetManager.updateAppWidget(appWidgetId, views)
  }

  private fun renderHeader(views: RemoteViews, snapshot: WidgetSnapshot, accent: Int) {
    views.setInt(R.id.termix_widget_accent_block, "setBackgroundColor", accent)
    views.setTextViewText(R.id.termix_widget_wordmark, wordmark)

    val summary = summaryText(snapshot)
    views.setViewVisibility(
      R.id.termix_widget_summary,
      if (summary == null) View.GONE else View.VISIBLE
    )
    views.setViewVisibility(
      R.id.termix_widget_summary_dot,
      if (summary != null && showsSummaryDot) View.VISIBLE else View.GONE
    )
    if (summary != null) {
      views.setTextViewText(R.id.termix_widget_summary, summary)
      if (showsSummaryDot) {
        views.setInt(R.id.termix_widget_summary_dot, "setColorFilter", WidgetTheme.ONLINE)
      }
    }
  }

  /** Right-hand header label, or null to hide it. */
  protected open fun summaryText(snapshot: WidgetSnapshot): String? =
    if (snapshot.summary.total > 0) {
      "${snapshot.summary.online}/${snapshot.summary.total}"
    } else {
      null
    }

  /** Whether the green dot precedes the summary label. */
  protected open val showsSummaryDot: Boolean = true

  private fun renderFooter(views: RemoteViews, snapshot: WidgetSnapshot) {
    views.setTextViewText(R.id.termix_widget_server, snapshot.server)
    views.setViewVisibility(
      R.id.termix_widget_server,
      if (snapshot.server.isEmpty()) View.GONE else View.VISIBLE
    )
    views.setTextViewText(
      R.id.termix_widget_age,
      WidgetTheme.relativeAge(snapshot.updatedAt)
    )
  }

  private fun renderEmptyState(views: RemoteViews, snapshot: WidgetSnapshot, accent: Int) {
    val signedOut = snapshot.state == SnapshotState.SIGNED_OUT
    // The account having hosts while the list is empty means the widget's own
    // filters excluded them — "no hosts yet" would be a lie.
    val filteredOut = !signedOut && snapshot.summary.total > 0
    val subject = emptySubject.dropLast(1)

    views.setTextViewText(
      R.id.termix_widget_empty_title,
      when {
        signedOut -> "Not signed in"
        filteredOut -> "Nothing to show"
        else -> "No $emptySubject yet"
      }
    )
    views.setTextViewText(
      R.id.termix_widget_empty_message,
      when {
        signedOut -> "Open Termix to connect to your server."
        filteredOut ->
          "Widget filters hide every $subject. Change them in Settings \u2192 Widgets."
        else -> "Add a $subject in Termix, or enable them in Settings \u2192 Widgets."
      }
    )
    views.setTextColor(R.id.termix_widget_empty_action, accent)
  }

  private fun bindCollection(context: Context, views: RemoteViews, appWidgetId: Int) {
    val intent = Intent(context, HostCollectionService::class.java).apply {
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
      putExtra(HostCollectionService.EXTRA_KIND, collectionKind)
      // A unique data URI per widget stops Android from reusing another
      // widget's factory (intents are compared without extras).
      data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
    }

    views.setRemoteAdapter(collectionViewId, intent)
    views.setEmptyView(collectionViewId, R.id.termix_widget_empty)
    views.setPendingIntentTemplate(
      collectionViewId,
      WidgetLinks.itemTemplate(context, appWidgetId)
    )
  }
}

/** Launcher grid of hosts — tapping a tile opens a terminal session. */
class QuickConnectWidgetProvider : TermixWidgetProvider() {
  override val layoutId = R.layout.termix_widget_quick_connect
  override val collectionViewId = R.id.termix_widget_grid
  override val collectionKind = HostCollectionService.KIND_QUICK
}

/** Metric list — CPU and memory bars per host. */
class StatusWidgetProvider : TermixWidgetProvider() {
  override val layoutId = R.layout.termix_widget_status
  override val collectionViewId = R.id.termix_widget_list
  override val collectionKind = HostCollectionService.KIND_STATUS
}

/** Saved commands — tapping one copies it and opens the snippets list. */
class SnippetsWidgetProvider : TermixWidgetProvider() {
  override val layoutId = R.layout.termix_widget_snippets
  override val collectionViewId = R.id.termix_widget_snippet_list
  override val collectionKind = HostCollectionService.KIND_SNIPPETS
  override val wordmark = "SNIPPETS"
  override val headerUri: Uri = Uri.parse("termix-mobile://widget/snippets")
  override val emptySubject = "snippets"
  override val showsSummaryDot = false

  override fun summaryText(snapshot: WidgetSnapshot): String? =
    snapshot.snippets.size.takeIf { it > 0 }?.toString()
}
