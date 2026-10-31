package expo.modules.termixsessionservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Foreground service that keeps the app process alive while sessions are open.
 * The SSH engine and sockets run on their own; this only holds the process
 * and shows the ongoing notification with a Disconnect all action.
 */
class SessionService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_DISCONNECT_ALL) {
      stop()
      onDisconnectAll?.invoke()
      return START_NOT_STICKY
    }
    val content = Content.from(intent) ?: lastContent ?: Content.EMPTY
    lastContent = content
    val notification = build(content)
    try {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
          ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
        else 0
      )
      running = true
    } catch (e: Exception) {
      // Not allowed right now (started from the background); try again later.
      running = false
      stopSelf()
    }
    return START_NOT_STICKY
  }

  // Swiping the app away ends its sessions; the tabs come back on next launch.
  override fun onTaskRemoved(rootIntent: Intent?) {
    stop()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  private fun stop() {
    running = false
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun build(content: Content): Notification {
    ensureChannel(this, content.channelName)
    val open = PendingIntent.getActivity(
      this,
      0,
      openAppIntent(this),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val disconnect = PendingIntent.getService(
      this,
      1,
      Intent(this, SessionService::class.java).setAction(ACTION_DISCONNECT_ALL),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val style = NotificationCompat.InboxStyle()
    content.lines.take(MAX_LINES).forEach { style.addLine(it) }
    if (content.lines.size > MAX_LINES) {
      style.setSummaryText("+${content.lines.size - MAX_LINES}")
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(smallIcon(this))
      .setContentTitle(content.title)
      .setContentText(content.lines.firstOrNull() ?: "")
      .setStyle(style)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setContentIntent(open)
      .addAction(0, content.actionLabel, disconnect)
      .build()
  }

  data class Content(
    val title: String,
    val lines: List<String>,
    val actionLabel: String,
    val channelName: String
  ) {
    fun into(intent: Intent): Intent = intent
      .putExtra(EXTRA_TITLE, title)
      .putStringArrayListExtra(EXTRA_LINES, ArrayList(lines))
      .putExtra(EXTRA_ACTION, actionLabel)
      .putExtra(EXTRA_CHANNEL, channelName)

    companion object {
      val EMPTY = Content("Termix", emptyList(), "Disconnect all", "Sessions")

      fun from(intent: Intent?): Content? {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: return null
        return Content(
          title,
          intent.getStringArrayListExtra(EXTRA_LINES) ?: emptyList(),
          intent.getStringExtra(EXTRA_ACTION) ?: EMPTY.actionLabel,
          intent.getStringExtra(EXTRA_CHANNEL) ?: EMPTY.channelName
        )
      }
    }
  }

  companion object {
    const val ACTION_DISCONNECT_ALL = "expo.modules.termixsessionservice.DISCONNECT_ALL"
    private const val CHANNEL_ID = "termix_sessions"
    private const val NOTIFICATION_ID = 7310
    private const val MAX_LINES = 6
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_LINES = "lines"
    private const val EXTRA_ACTION = "action"
    private const val EXTRA_CHANNEL = "channel"

    @Volatile var running = false
      private set
    private var lastContent: Content? = null

    /** Set by the module while JS listens. */
    var onDisconnectAll: (() -> Unit)? = null

    fun start(context: Context, content: Content): Boolean {
      val intent = content.into(Intent(context, SessionService::class.java))
      return try {
        if (running) context.startService(intent)
        else androidx.core.content.ContextCompat.startForegroundService(context, intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    fun stop(context: Context) {
      if (!running) return
      running = false
      context.stopService(Intent(context, SessionService::class.java))
    }

    private fun ensureChannel(context: Context, name: String) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java) ?: return
      val channel = NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW)
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }

    private fun smallIcon(context: Context): Int {
      val id = context.resources.getIdentifier("ic_stat_termix", "drawable", context.packageName)
      return if (id != 0) id else context.applicationInfo.icon
    }

    private fun openAppIntent(context: Context): Intent {
      val component = context.packageManager
        .getLaunchIntentForPackage(context.packageName)
        ?.component
      return Intent(Intent.ACTION_VIEW, Uri.parse("termix-mobile://sessions")).apply {
        if (component != null) setComponent(component) else setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
    }
  }
}
