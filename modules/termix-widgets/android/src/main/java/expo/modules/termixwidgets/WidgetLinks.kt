package expo.modules.termixwidgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * Deep links out of the widgets.
 *
 * Everything lands on the app's launch activity with an ACTION_VIEW intent; the
 * JS side (`app/widgets/useWidgetDeepLink.ts`) decides what the URL means.
 */
object WidgetLinks {
  private fun launchIntent(context: Context): Intent {
    val component = context.packageManager
      .getLaunchIntentForPackage(context.packageName)
      ?.component
    return Intent(Intent.ACTION_VIEW).apply {
      // Addressing the activity directly keeps the intent unambiguous even if
      // another app claims the same scheme.
      if (component != null) setComponent(component) else setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
  }

  /**
   * FLAG_MUTABLE only exists from API 31, and mutability is the default below
   * it — so only the immutable case needs a flag on older versions.
   */
  private fun flags(mutable: Boolean): Int {
    val base = PendingIntent.FLAG_UPDATE_CURRENT
    return when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
        base or if (mutable) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE
      !mutable && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ->
        base or PendingIntent.FLAG_IMMUTABLE
      else -> base
    }
  }

  /**
   * Template used by collection items. Must be mutable: each row supplies its
   * own URL through a fill-in intent.
   */
  fun itemTemplate(context: Context, widgetId: Int): PendingIntent =
    PendingIntent.getActivity(context, widgetId, launchIntent(context), flags(mutable = true))

  /** Fill-in intent carrying one host's deep link. */
  fun fillIn(uri: Uri): Intent = Intent().setData(uri)

  /** Opens the app at [uri] (header / empty-state taps). */
  fun openApp(
    context: Context,
    widgetId: Int,
    uri: Uri = WidgetSnapshot.FALLBACK_URI
  ): PendingIntent {
    val intent = launchIntent(context).setData(uri)
    // Offset the request code so it can't collide with the item template above.
    return PendingIntent.getActivity(
      context,
      widgetId + REQUEST_CODE_OPEN_OFFSET,
      intent,
      flags(mutable = false)
    )
  }

  private const val REQUEST_CODE_OPEN_OFFSET = 100_000
}
