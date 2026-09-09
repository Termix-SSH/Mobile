package expo.modules.termixwidgets

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.ListView
import android.widget.RadioGroup
import android.widget.TextView

/**
 * Host picker shown when a Quick Connect or Server Status widget is placed.
 *
 * Reads the hosts out of the snapshot the app already published, so it needs no
 * network access and works while the app is closed. Picking "Automatic" stores
 * nothing, which keeps the default ordering (pinned, then online, then by name).
 *
 * The result must be RESULT_OK with the widget id, or the launcher cancels the
 * placement, so the activity defaults to a cancelled result and only upgrades it
 * once a choice is committed.
 */
class WidgetConfigureActivity : Activity() {
  private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID
  /** Tab the tiles open. Seeded from the widget's current setting. */
  private var session: SessionKind = SessionKind.TERMINAL

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    appWidgetId = intent?.extras?.getInt(
      AppWidgetManager.EXTRA_APPWIDGET_ID,
      AppWidgetManager.INVALID_APPWIDGET_ID
    ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

    // Backing out must leave the widget unplaced rather than half-configured.
    setResult(RESULT_CANCELED, resultIntent())

    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }

    setContentView(R.layout.termix_widget_configure)

    val snapshot = SnapshotStore.read(this)
    val hosts = snapshot.hosts
    val list = findViewById<ListView>(R.id.termix_configure_list)
    val empty = findViewById<View>(R.id.termix_configure_empty)

    // The status widget is about metrics, so it opens the stats tab unless the
    // user says otherwise. Quick Connect opens a terminal.
    val defaultSession =
      if (isStatusWidget()) SessionKind.STATS else SessionKind.TERMINAL
    session = WidgetSelection.sessionKind(this, appWidgetId, defaultSession)
    bindSessionPicker()

    if (hosts.isEmpty()) {
      findViewById<View>(R.id.termix_configure_session).visibility = View.GONE
      // No snapshot yet, which is normal when the widget is added before
      // signing in. Committing "Automatic" still places a usable widget, and it
      // fills in as soon as the app publishes.
      list.visibility = View.GONE
      empty.visibility = View.VISIBLE
      findViewById<View>(R.id.termix_configure_empty_action).setOnClickListener {
        commit(WidgetSelection.NO_HOST)
      }
      return
    }

    // Reconfiguring an existing widget should show what it is set to now.
    val current = WidgetSelection.hostId(this, appWidgetId)
    val options = listOf(HostOption.automatic(this)) + hosts.map(HostOption::from)
    list.adapter = HostOptionAdapter(
      options,
      current,
      WidgetTheme.parseAccent(snapshot.accent)
    )
    list.setOnItemClickListener { _, _, position, _ ->
      commit(options[position].hostId)
    }
  }

  /**
   * Which provider this widget belongs to. The launcher hands the configuration
   * activity only a widget id, so the provider is looked up from it.
   */
  private fun isStatusWidget(): Boolean = runCatching {
    AppWidgetManager.getInstance(this)
      ?.getAppWidgetInfo(appWidgetId)
      ?.provider
      ?.className
      ?.contains("Status") == true
  }.getOrDefault(false)

  private fun bindSessionPicker() {
    val group = findViewById<RadioGroup>(R.id.termix_configure_session_group)
    group.check(
      when (session) {
        SessionKind.TERMINAL -> R.id.termix_configure_session_terminal
        SessionKind.STATS -> R.id.termix_configure_session_stats
        SessionKind.FILES -> R.id.termix_configure_session_files
      }
    )
    group.setOnCheckedChangeListener { _, checkedId ->
      session = when (checkedId) {
        R.id.termix_configure_session_stats -> SessionKind.STATS
        R.id.termix_configure_session_files -> SessionKind.FILES
        else -> SessionKind.TERMINAL
      }
    }
  }

  /** Stores the choice, redraws the widget, and lets the launcher place it. */
  private fun commit(hostId: Int) {
    WidgetSelection.setHostId(this, appWidgetId, hostId)
    WidgetSelection.setSessionKind(this, appWidgetId, session)
    runCatching { WidgetUpdater.updateAll(this) }
    setResult(RESULT_OK, resultIntent())
    finish()
  }

  private fun resultIntent(): Intent =
    Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)

  /** One row: either a real host or the "Automatic" entry. */
  private data class HostOption(
    val hostId: Int,
    val name: String,
    val subtitle: String
  ) {
    companion object {
      fun automatic(activity: Activity) = HostOption(
        hostId = WidgetSelection.NO_HOST,
        name = activity.getString(R.string.termix_widget_configure_automatic),
        subtitle = activity.getString(R.string.termix_widget_configure_automatic_detail)
      )

      fun from(host: HostEntry) = HostOption(
        hostId = host.id,
        name = host.name,
        subtitle = host.subtitle.ifEmpty { host.folder }
      )
    }
  }

  private inner class HostOptionAdapter(
    private val options: List<HostOption>,
    private val selectedHostId: Int,
    private val accentColor: Int
  ) : BaseAdapter() {
    override fun getCount(): Int = options.size

    override fun getItem(position: Int): Any = options[position]

    override fun getItemId(position: Int): Long = options[position].hostId.toLong()

    override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
      val view = convertView ?: layoutInflater.inflate(
        R.layout.termix_widget_configure_row,
        parent,
        false
      )
      val option = options[position]

      val name = view.findViewById<TextView>(R.id.termix_configure_row_name)
      val selected = option.hostId == selectedHostId
      name.text = if (selected) "${option.name}  ✓" else option.name
      name.setTextColor(if (selected) accentColor else WidgetTheme.TEXT_PRIMARY)

      val subtitle = view.findViewById<TextView>(R.id.termix_configure_row_subtitle)
      subtitle.text = option.subtitle
      subtitle.visibility = if (option.subtitle.isEmpty()) View.GONE else View.VISIBLE

      return view
    }
  }
}
