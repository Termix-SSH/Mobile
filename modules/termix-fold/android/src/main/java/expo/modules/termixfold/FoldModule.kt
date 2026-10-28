package expo.modules.termixfold

import android.app.Activity
import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Where the screen bends on a foldable, in dp from the window's top left.
 * Flat folds are listed too (inactive), so layouts can stay put while the phone opens.
 */
class FoldModule : Module() {
  private var tracker: WindowInfoTrackerCallbackAdapter? = null
  private var activity: Activity? = null
  @Volatile
  private var last: List<Map<String, Any>> = emptyList()

  private val listener = Consumer<WindowLayoutInfo> { info ->
    val density = activity?.resources?.displayMetrics?.density ?: 1f
    val folds = info.displayFeatures.filterIsInstance<FoldingFeature>().map { fold ->
      val b = fold.bounds
      mapOf(
        "x" to (b.left / density).toDouble(),
        "y" to (b.top / density).toDouble(),
        "width" to (b.width() / density).toDouble(),
        "height" to (b.height() / density).toDouble(),
        "active" to (fold.state == FoldingFeature.State.HALF_OPENED),
      )
    }
    if (folds != last) {
      last = folds
      sendEvent("onFoldChange", mapOf("folds" to folds))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("TermixFold")

    Events("onFoldChange")

    Function("getFolds") { last }

    OnActivityEntersForeground { start() }

    OnActivityDestroys { stop() }

    OnDestroy { stop() }
  }

  private fun start() {
    val current = appContext.currentActivity ?: return
    if (activity === current && tracker != null) return
    stop()
    val adapter = WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(current))
    adapter.addWindowLayoutInfoListener(current, ContextCompat.getMainExecutor(current), listener)
    tracker = adapter
    activity = current
  }

  private fun stop() {
    tracker?.removeWindowLayoutInfoListener(listener)
    tracker = null
    activity = null
  }
}
