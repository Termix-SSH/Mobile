package expo.modules.termixsessionservice

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Starts, updates and stops the session service, plus the battery and notification settings. */
class TermixSessionServiceModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TermixSessionService")

    Constant("isSupported") { true }

    Events("onDisconnectAll")

    OnStartObserving {
      SessionService.onDisconnectAll = { sendEvent("onDisconnectAll", emptyMap<String, Any>()) }
    }

    OnStopObserving {
      SessionService.onDisconnectAll = null
    }

    Function("show") { title: String, lines: List<String>, actionLabel: String, channelName: String ->
      SessionService.start(
        context,
        SessionService.Content(title, lines, actionLabel, channelName)
      )
    }

    Function("hide") {
      SessionService.stop(context)
    }

    Function("isRunning") {
      SessionService.running
    }

    Function("notificationsEnabled") {
      NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    Function("ignoresBatteryOptimizations") {
      val power = context.getSystemService(PowerManager::class.java)
      power?.isIgnoringBatteryOptimizations(context.packageName) ?: false
    }

    // The list screen needs no special permission, unlike the direct prompt.
    Function("openBatteryOptimizationSettings") {
      open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    Function("openNotificationSettings") {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
      }
      open(intent)
    }

    // Only iOS has a grace period.
    AsyncFunction("beginGrace") {}
    AsyncFunction("endGrace") {}
  }

  private fun open(intent: Intent): Boolean = try {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (e: Exception) {
    false
  }
}
