package expo.modules.termixwidgets

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.ListView
import android.widget.TextView

/**
 * Machine picker shown when a Power widget is placed. Reads the device list the
 * app published, so it works with the app closed.
 */
class PowerConfigureActivity : Activity() {
  private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    appWidgetId = intent?.extras?.getInt(
      AppWidgetManager.EXTRA_APPWIDGET_ID,
      AppWidgetManager.INVALID_APPWIDGET_ID
    ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
    setResult(RESULT_CANCELED, resultIntent())
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }

    setContentView(R.layout.termix_widget_configure)
    findViewById<View>(R.id.termix_configure_session).visibility = View.GONE
    findViewById<TextView>(R.id.termix_configure_title)
      .setText(R.string.termix_widget_power_configure_title)
    findViewById<TextView>(R.id.termix_configure_message)
      .setText(R.string.termix_widget_power_configure_message)
    findViewById<TextView>(R.id.termix_configure_empty_text)
      .setText(R.string.termix_widget_power_configure_empty)

    val devices = PowerStore.devices(this)
    val list = findViewById<ListView>(R.id.termix_configure_list)
    if (devices.isEmpty()) {
      list.visibility = View.GONE
      findViewById<View>(R.id.termix_configure_empty).visibility = View.VISIBLE
      findViewById<View>(R.id.termix_configure_empty_action).setOnClickListener { commit(null) }
      return
    }

    val current = PowerStore.choice(this, appWidgetId) ?: devices.first().key
    val accent = WidgetTheme.parseAccent(SnapshotStore.read(this).accent)
    list.adapter = DeviceAdapter(devices, current, accent)
    list.setOnItemClickListener { _, _, position, _ -> commit(devices[position].key) }
  }

  private fun commit(key: String?) {
    PowerStore.setChoice(this, appWidgetId, key)
    val update = Intent(this, PowerWidgetProvider::class.java)
      .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
      .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId))
    sendBroadcast(update)
    setResult(RESULT_OK, resultIntent())
    finish()
  }

  private fun resultIntent(): Intent =
    Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)

  private inner class DeviceAdapter(
    private val devices: List<PowerDevice>,
    private val selectedKey: String,
    private val accentColor: Int
  ) : BaseAdapter() {
    override fun getCount(): Int = devices.size
    override fun getItem(position: Int): Any = devices[position]
    override fun getItemId(position: Int): Long = position.toLong()

    override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
      val view = convertView ?: layoutInflater.inflate(R.layout.termix_widget_configure_row, parent, false)
      val device = devices[position]
      val selected = device.key == selectedKey
      view.findViewById<TextView>(R.id.termix_configure_row_name).apply {
        text = if (selected) "${device.name}  ✓" else device.name
        setTextColor(if (selected) accentColor else WidgetTheme.TEXT_PRIMARY)
      }
      val detail = listOf(device.address, device.server).filter { it.isNotEmpty() }.joinToString(" | ")
      view.findViewById<TextView>(R.id.termix_configure_row_subtitle).apply {
        text = detail
        visibility = if (detail.isEmpty()) View.GONE else View.VISIBLE
      }
      return view
    }
  }
}
