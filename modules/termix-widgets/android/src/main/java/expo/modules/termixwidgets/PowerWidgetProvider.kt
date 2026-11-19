package expo.modules.termixwidgets

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Calls the Wake-on-LAN plugin with the access the app saved. */
object PowerClient {
  class PowerException(message: String) : Exception(message)

  private fun open(context: Context, device: PowerDevice, path: String, method: String): HttpURLConnection {
    val access = PowerStore.access(context, device.accountId)
      ?: throw PowerException("Open Termix")
    val connection = URL("${access.base}/plugin-api/wake-on-lan$path").openConnection() as HttpURLConnection
    connection.requestMethod = method
    connection.connectTimeout = 8000
    connection.readTimeout = 8000
    connection.instanceFollowRedirects = false
    connection.setRequestProperty("Accept", "application/json")
    access.headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }
    return connection
  }

  /** Live status of one device, or null when the server can't be reached. */
  fun status(context: Context, device: PowerDevice): PowerStatus? = runCatching {
    val connection = open(context, device, "/status", "GET")
    try {
      if (connection.responseCode != 200) return null
      val body = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
      val rows = body.optJSONArray("statuses") ?: return null
      (0 until rows.length())
        .mapNotNull { rows.optJSONObject(it) }
        .firstOrNull { it.optInt("hostId") == device.hostId }
        ?.let { PowerStatus.from(it.optString("status")) }
    } finally {
      connection.disconnect()
    }
  }.getOrNull()

  /** Sends "wake" or "shutdown". Throws with a short message on failure. */
  fun send(context: Context, device: PowerDevice, action: String) {
    val connection = open(context, device, "/devices/${device.hostId}/$action", "POST")
    try {
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { it.write("{}".toByteArray()) }
      val code = connection.responseCode
      if (code in 200..299) return
      if (code == 401) throw PowerException("Open Termix to sign in")
      val message = runCatching {
        JSONObject(connection.errorStream.bufferedReader().use { it.readText() }).optString("error")
      }.getOrNull()
      throw PowerException(message?.takeIf { it.isNotBlank() } ?: "Failed ($code)")
    } finally {
      connection.disconnect()
    }
  }
}

/**
 * Power: one Wake-on-LAN device with its name and status. A tap wakes it when
 * it is off and shuts it down when it is on, with the app closed.
 */
class PowerWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { runCatching { render(context, manager, it) } }
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    super.onDeleted(context, appWidgetIds)
    runCatching { PowerStore.forget(context, appWidgetIds) }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    val action = intent.action ?: return
    if (action != ACTION_TOGGLE && action != ACTION_REFRESH &&
      action != AppWidgetManager.ACTION_APPWIDGET_UPDATE
    ) return

    val appContext = context.applicationContext
    val pending = goAsync()
    Thread {
      try {
        if (action == ACTION_TOGGLE) {
          val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
          if (id != AppWidgetManager.INVALID_APPWIDGET_ID) toggle(appContext, id)
        }
        refreshAll(appContext)
      } catch (_: Throwable) {
        // A widget problem must never crash the app process.
      } finally {
        pending.finish()
      }
    }.start()
  }

  companion object {
    const val ACTION_TOGGLE = "expo.modules.termixwidgets.POWER_TOGGLE"
    const val ACTION_REFRESH = "expo.modules.termixwidgets.POWER_REFRESH"
    private const val MOVING_REFRESH_MS = 15_000L

    fun ids(context: Context): IntArray = runCatching {
      AppWidgetManager.getInstance(context)
        .getAppWidgetIds(ComponentName(context, PowerWidgetProvider::class.java))
    }.getOrNull() ?: IntArray(0)

    /** Redraws from what is stored, without the network. */
    fun renderAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context) ?: return
      ids(context).forEach { runCatching { render(context, manager, it) } }
    }

    /** Fetches live status for every placed widget, redraws and plans the next check. */
    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context) ?: return
      val ids = ids(context)
      var soonest = Long.MAX_VALUE
      val now = System.currentTimeMillis()
      for (id in ids) {
        val device = PowerStore.deviceFor(context, id)
        if (device != null) {
          PowerClient.status(context, device)?.let { PowerStore.setLive(context, device.key, it) }
          if (PowerStore.status(context, device).isMoving) soonest = minOf(soonest, now + MOVING_REFRESH_MS)
          PowerStore.armedUntil(context, device.key).takeIf { it > now }?.let { soonest = minOf(soonest, it + 500) }
          PowerStore.notice(context, device.key)?.let { soonest = minOf(soonest, it.second + 500) }
        }
        runCatching { render(context, manager, id) }
      }
      if (soonest != Long.MAX_VALUE) schedule(context, soonest - now)
    }

    private fun toggle(context: Context, appWidgetId: Int) {
      val device = PowerStore.deviceFor(context, appWidgetId) ?: return
      val key = device.key
      val now = System.currentTimeMillis()
      val current = PowerStore.status(context, device)
      PowerStore.setNotice(context, key, null)
      if (current.isMoving) return

      val action: String
      val next: PowerStatus
      if (current == PowerStatus.ONLINE) {
        if (!device.canShutdown) {
          PowerStore.setNotice(context, key, "No shutdown access", 8000)
          return
        }
        if (device.confirmShutdown && PowerStore.armedUntil(context, key) <= now) {
          PowerStore.setArmed(context, key, now + PowerStore.ARM_MS)
          return
        }
        action = "shutdown"
        next = PowerStatus.STOPPING
      } else {
        if (!device.canWake) {
          PowerStore.setNotice(context, key, "No wake access", 8000)
          return
        }
        action = "wake"
        next = PowerStatus.WAKING
      }
      PowerStore.setArmed(context, key, 0)
      // Show the change right away, before the server answers.
      PowerStore.setPending(context, key, next, current)
      renderAll(context)
      try {
        PowerClient.send(context, device, action)
      } catch (error: Exception) {
        PowerStore.clearPending(context, key)
        PowerStore.setNotice(context, key, error.message ?: "Failed")
      }
    }

    private fun schedule(context: Context, delayMs: Long) {
      val alarms = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
      val intent = Intent(context, PowerWidgetProvider::class.java).setAction(ACTION_REFRESH)
      val pending = PendingIntent.getBroadcast(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      alarms.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + delayMs.coerceAtLeast(1000), pending)
    }

    private fun render(context: Context, manager: AppWidgetManager, appWidgetId: Int) {
      val main = SnapshotStore.read(context)
      val chrome = WidgetTheme.chrome(context, main.theme)
      val accent = WidgetTheme.parseAccent(main.accent)
      val views = RemoteViews(context.packageName, R.layout.termix_widget_power)
      views.setInt(R.id.termix_power_root, "setBackgroundResource", chrome.background)
      views.setInt(R.id.termix_power_accent, "setBackgroundColor", accent)
      views.setTextColor(R.id.termix_power_wordmark, chrome.textPrimary)

      val device = PowerStore.deviceFor(context, appWidgetId)
      if (device == null) {
        views.setViewVisibility(R.id.termix_power_body, View.GONE)
        views.setViewVisibility(R.id.termix_power_empty, View.VISIBLE)
        views.setTextColor(R.id.termix_power_empty_title, chrome.textPrimary)
        views.setTextColor(R.id.termix_power_empty_message, chrome.textTertiary)
        views.setOnClickPendingIntent(
          R.id.termix_power_root,
          WidgetLinks.openApp(context, appWidgetId, WidgetSnapshot.FALLBACK_URI)
        )
        manager.updateAppWidget(appWidgetId, views)
        return
      }

      val now = System.currentTimeMillis()
      val status = PowerStore.status(context, device, now)
      val armed = PowerStore.armedUntil(context, device.key) > now
      val notice = PowerStore.notice(context, device.key)?.first
      val color = when (status) {
        PowerStatus.ONLINE -> WidgetTheme.ONLINE
        PowerStatus.OFFLINE, PowerStatus.FAILED -> WidgetTheme.OFFLINE
        PowerStatus.WAKING, PowerStatus.STOPPING -> accent
        PowerStatus.UNKNOWN -> WidgetTheme.UNKNOWN
      }
      val hint = when {
        notice != null -> notice
        armed -> "Tap again to shut down"
        status == PowerStatus.ONLINE -> if (device.canShutdown) "Tap to shut down" else ""
        status == PowerStatus.WAKING -> "Waking up"
        status == PowerStatus.STOPPING -> "Shutting down"
        else -> if (device.canWake) "Tap to wake" else ""
      }

      views.setViewVisibility(R.id.termix_power_body, View.VISIBLE)
      views.setViewVisibility(R.id.termix_power_empty, View.GONE)
      views.setInt(R.id.termix_power_icon, "setColorFilter", if (armed) WidgetTheme.OFFLINE else color)
      views.setTextViewText(R.id.termix_power_name, device.name)
      views.setTextColor(R.id.termix_power_name, chrome.textPrimary)
      views.setTextViewText(R.id.termix_power_address, device.address)
      views.setTextColor(R.id.termix_power_address, chrome.textTertiary)
      views.setViewVisibility(
        R.id.termix_power_address,
        if (device.address.isEmpty()) View.GONE else View.VISIBLE
      )
      views.setInt(R.id.termix_power_dot, "setColorFilter", color)
      views.setTextViewText(R.id.termix_power_status, status.label)
      views.setTextColor(R.id.termix_power_status, color)
      views.setTextViewText(R.id.termix_power_hint, hint)
      views.setTextColor(
        R.id.termix_power_hint,
        if (armed || notice != null) WidgetTheme.OFFLINE else chrome.textSecondary
      )
      views.setContentDescription(
        R.id.termix_power_root,
        "${device.name}, ${status.label.lowercase()}. $hint"
      )

      val toggle = Intent(context, PowerWidgetProvider::class.java)
        .setAction(ACTION_TOGGLE)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
      views.setOnClickPendingIntent(
        R.id.termix_power_root,
        PendingIntent.getBroadcast(
          context,
          appWidgetId,
          toggle,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      )
      manager.updateAppWidget(appWidgetId, views)
    }
  }
}
