package expo.modules.termixwidgets

import android.content.Context
import android.content.Intent
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/**
 * Feeds host rows to the collection widgets.
 *
 * Runs in the launcher's process, so it must be cheap and self-contained: it
 * only reads the JSON snapshot the app already wrote. `onDataSetChanged` is the
 * single point where data is refreshed, which the provider triggers through
 * `WidgetUpdater`.
 */
class HostCollectionService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
    val kind = intent.getStringExtra(EXTRA_KIND) ?: KIND_QUICK
    return HostCollectionFactory(applicationContext, kind)
  }

  companion object {
    const val EXTRA_KIND = "expo.modules.termixwidgets.KIND"
    const val KIND_QUICK = "quick"
    const val KIND_STATUS = "status"
    const val KIND_SNIPPETS = "snippets"
  }
}

private class HostCollectionFactory(
  private val context: Context,
  private val kind: String
) : RemoteViewsService.RemoteViewsFactory {

  /** Cells in a block meter. Ten reads cleanly at widget sizes. */
  private val meterCells = 10

  private var snapshot: WidgetSnapshot = WidgetSnapshot.signedOut()
  private var hosts: List<HostEntry> = emptyList()
  private var snippets: List<SnippetEntry> = emptyList()

  override fun onCreate() = reload()

  override fun onDataSetChanged() = reload()

  override fun onDestroy() {
    hosts = emptyList()
    snippets = emptyList()
  }

  private fun reload() {
    snapshot = SnapshotStore.read(context)
    snippets = if (kind == HostCollectionService.KIND_SNIPPETS) snapshot.snippets else emptyList()
    hosts = if (kind == HostCollectionService.KIND_STATUS) {
      // The status widget leads with hosts that actually report metrics, but
      // never goes blank just because nothing is online.
      val online = snapshot.hosts.filter { it.status == HostStatus.ONLINE }
      if (online.isEmpty()) snapshot.hosts else online
    } else {
      snapshot.hosts
    }
  }

  override fun getCount(): Int =
    if (kind == HostCollectionService.KIND_SNIPPETS) snippets.size else hosts.size

  override fun getViewTypeCount(): Int = 1

  override fun hasStableIds(): Boolean = true

  override fun getItemId(position: Int): Long {
    val id = if (kind == HostCollectionService.KIND_SNIPPETS) {
      snippets.getOrNull(position)?.id
    } else {
      hosts.getOrNull(position)?.id
    }
    return id?.toLong() ?: position.toLong()
  }

  override fun getLoadingView(): RemoteViews? = null

  override fun getViewAt(position: Int): RemoteViews {
    val accent = WidgetTheme.parseAccent(snapshot.accent)

    if (kind == HostCollectionService.KIND_SNIPPETS) {
      val snippet = snippets.getOrNull(position)
        ?: return RemoteViews(context.packageName, R.layout.termix_widget_item_snippet)
      return snippetRow(snippet, accent)
    }

    val host = hosts.getOrNull(position) ?: return RemoteViews(
      context.packageName,
      R.layout.termix_widget_item_quick
    )

    return if (kind == HostCollectionService.KIND_STATUS) {
      statusRow(host, accent)
    } else {
      quickTile(host, accent)
    }
  }

  // MARK: - Row builders

  private fun quickTile(host: HostEntry, accent: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.termix_widget_item_quick)

    views.setTextViewText(R.id.termix_item_name, host.name)
    views.setInt(R.id.termix_item_dot, "setColorFilter", WidgetTheme.statusColor(host.status))
    views.setContentDescription(R.id.termix_item_root, describe(host))

    val subtitle = host.subtitle.ifEmpty { host.folder }
    views.setTextViewText(R.id.termix_item_subtitle, subtitle)
    views.setViewVisibility(
      R.id.termix_item_subtitle,
      if (subtitle.isEmpty()) View.GONE else View.VISIBLE
    )

    views.setViewVisibility(
      R.id.termix_item_pin,
      if (host.pinned) View.VISIBLE else View.GONE
    )
    if (host.pinned) {
      views.setInt(R.id.termix_item_pin, "setColorFilter", accent)
    }

    views.setOnClickFillInIntent(R.id.termix_item_root, WidgetLinks.fillIn(host.uri))
    return views
  }

  private fun snippetRow(snippet: SnippetEntry, accent: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.termix_widget_item_snippet)

    views.setTextColor(R.id.termix_item_caret, accent)
    views.setTextViewText(R.id.termix_item_name, snippet.name)
    views.setTextViewText(R.id.termix_item_preview, snippet.preview)
    views.setViewVisibility(
      R.id.termix_item_preview,
      if (snippet.preview.isEmpty()) View.GONE else View.VISIBLE
    )

    views.setContentDescription(
      R.id.termix_item_root,
      "${snippet.name}. Copies the command and opens Termix."
    )
    views.setOnClickFillInIntent(R.id.termix_item_root, WidgetLinks.fillIn(snippet.uri))
    return views
  }

  private fun statusRow(host: HostEntry, accent: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.termix_widget_item_status)

    views.setTextViewText(R.id.termix_item_name, host.name)
    views.setInt(R.id.termix_item_dot, "setColorFilter", WidgetTheme.statusColor(host.status))
    views.setContentDescription(R.id.termix_item_root, describe(host))
    views.setTextViewText(R.id.termix_item_subtitle, host.subtitle)
    views.setViewVisibility(
      R.id.termix_item_subtitle,
      if (host.subtitle.isEmpty()) View.GONE else View.VISIBLE
    )

    val online = host.status == HostStatus.ONLINE
    views.setViewVisibility(
      R.id.termix_item_metrics,
      if (online) View.VISIBLE else View.GONE
    )
    views.setViewVisibility(
      R.id.termix_item_offline,
      if (online) View.GONE else View.VISIBLE
    )

    if (online) {
      bindMetric(
        views,
        percent = host.cpu,
        accent = accent,
        valueId = R.id.termix_item_cpu_value,
        barId = R.id.termix_item_cpu_bar
      )
      bindMetric(
        views,
        percent = host.mem,
        accent = accent,
        valueId = R.id.termix_item_mem_value,
        barId = R.id.termix_item_mem_bar
      )
    } else {
      views.setTextViewText(
        R.id.termix_item_offline,
        if (host.status == HostStatus.OFFLINE) "OFFLINE" else "STATUS UNKNOWN"
      )
    }

    views.setOnClickFillInIntent(R.id.termix_item_root, WidgetLinks.fillIn(host.uri))
    return views
  }

  /**
   * Draws a usage meter as monospaced blocks with colour spans.
   *
   * Every alternative needs an API-gated call — `setProgressTintList` is API 31+
   * and reflective width/tint setters are only honoured for methods annotated
   * `@RemotableViewMethod`. Coloured spans on a plain TextView work on every
   * supported version and match the terminal aesthetic.
   */
  private fun bindMetric(
    views: RemoteViews,
    percent: Int?,
    accent: Int,
    valueId: Int,
    barId: Int
  ) {
    views.setTextViewText(valueId, percent?.let { "$it%" } ?: "--")
    views.setTextColor(
      valueId,
      if (percent == null) WidgetTheme.TEXT_TERTIARY else WidgetTheme.TEXT_SECONDARY
    )
    views.setTextViewText(barId, meter(percent, accent))
  }

  /** Builds "███░░░░░░░" with the filled run tinted by load. */
  private fun meter(percent: Int?, accent: Int): CharSequence {
    // A non-zero reading always lights at least one cell, so "1%" never looks
    // identical to "no data".
    val filled = when {
      percent == null -> 0
      percent <= 0 -> 0
      else -> ((percent * meterCells + 99) / 100).coerceIn(1, meterCells)
    }

    val text = SpannableString(
      buildString {
        repeat(filled) { append(FILLED_CELL) }
        repeat(meterCells - filled) { append(EMPTY_CELL) }
      }
    )

    if (filled > 0 && percent != null) {
      text.setSpan(
        ForegroundColorSpan(WidgetTheme.loadColor(percent, accent)),
        0,
        filled,
        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
      )
    }
    if (filled < meterCells) {
      text.setSpan(
        ForegroundColorSpan(WidgetTheme.TRACK),
        filled,
        meterCells,
        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
      )
    }

    return text
  }

  /** Screen-reader description for a host row. */
  private fun describe(host: HostEntry): String {
    val status = when (host.status) {
      HostStatus.ONLINE -> "online"
      HostStatus.OFFLINE -> "offline"
      HostStatus.UNKNOWN -> "status unknown"
    }
    val load = if (host.status == HostStatus.ONLINE && host.cpu != null) {
      ", CPU ${host.cpu}%, memory ${host.mem ?: 0}%"
    } else {
      ""
    }
    return "${host.name}, $status$load. Opens a terminal session."
  }

  private companion object {
    const val FILLED_CELL = "\u2588"
    const val EMPTY_CELL = "\u2591"
  }
}
