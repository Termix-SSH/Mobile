package expo.modules.termixframemonitor

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Log lines and the launch URL for the showcase build that makes store media.
class FrameMonitorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TermixFrameMonitor")

    // Release builds keep this, unlike console.log on iOS. CI greps for it.
    Function("log") { line: String -> android.util.Log.i("TermixLab", line) }

    // CI passes the URL as an intent extra: am start --es TERMIX_LAB_URL <url>.
    Function("launchUrl") {
      appContext.currentActivity?.intent?.getStringExtra("TERMIX_LAB_URL")
    }
  }
}
