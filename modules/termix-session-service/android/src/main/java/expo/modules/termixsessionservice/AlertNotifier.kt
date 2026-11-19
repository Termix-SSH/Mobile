package expo.modules.termixsessionservice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Server alerts shown by the app itself. The F-Droid build has no push
 * service, so it checks for alerts in the background and shows them here.
 */
object AlertNotifier {
  private const val CHANNEL = "alerts"
  private const val CRITICAL_CHANNEL = "alerts-critical"

  fun show(
    context: Context,
    id: Int,
    title: String,
    body: String,
    url: String,
    critical: Boolean,
    channelName: String,
    criticalChannelName: String
  ): Boolean {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return false
    ensureChannels(context, channelName, criticalChannelName)
    val component = context.packageManager
      .getLaunchIntentForPackage(context.packageName)
      ?.component
    val open = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      if (component != null) setComponent(component) else setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val pending = PendingIntent.getActivity(
      context,
      id,
      open,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val notification = NotificationCompat.Builder(context, if (critical) CRITICAL_CHANNEL else CHANNEL)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setPriority(if (critical) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
      .setContentIntent(pending)
      .build()
    return try {
      manager.notify(id, notification)
      true
    } catch (e: SecurityException) {
      false
    }
  }

  private fun ensureChannels(context: Context, name: String, criticalName: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL, name, NotificationManager.IMPORTANCE_DEFAULT)
    )
    manager.createNotificationChannel(
      NotificationChannel(CRITICAL_CHANNEL, criticalName, NotificationManager.IMPORTANCE_HIGH)
    )
  }

  private fun smallIcon(context: Context): Int {
    val id = context.resources.getIdentifier("ic_stat_termix", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }
}
