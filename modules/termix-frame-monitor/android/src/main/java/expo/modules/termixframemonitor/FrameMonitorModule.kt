package expo.modules.termixframemonitor

import android.app.ActivityManager
import android.content.Context
import android.os.Debug
import android.os.Handler
import android.os.HandlerThread
import android.view.Choreographer
import android.view.FrameMetrics
import android.view.Window
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Frame timing and memory for the terminal lab. Choreographer intervals show
// how often the UI thread kept up with vsync; FrameMetrics totals show what
// each drawn frame cost, render thread included.
class FrameMonitorModule : Module() {
  private val intervals = FloatArray(MAX)
  private var intervalCount = 0
  private val totals = FloatArray(MAX)
  private var totalCount = 0
  private var last = 0L
  private var running = false
  private var window: Window? = null
  private val metricsThread by lazy { HandlerThread("lab-frame-metrics").also { it.start() } }

  private val frame = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      if (!running) return
      if (last != 0L && intervalCount < MAX) {
        intervals[intervalCount++] = (frameTimeNanos - last) / 1e6f
      }
      last = frameTimeNanos
      Choreographer.getInstance().postFrameCallback(this)
    }
  }

  private val metrics = Window.OnFrameMetricsAvailableListener { _, m, _ ->
    if (running && totalCount < MAX) {
      totals[totalCount++] = m.getMetric(FrameMetrics.TOTAL_DURATION) / 1e6f
    }
  }

  override fun definition() = ModuleDefinition {
    Name("TermixFrameMonitor")

    // Release builds keep this, unlike console.log on iOS. CI greps for it.
    Function("log") { line: String -> android.util.Log.i("TermixLab", line) }

    Function("refreshRate") {
      @Suppress("DEPRECATION")
      appContext.currentActivity?.windowManager?.defaultDisplay?.refreshRate?.toDouble() ?: 60.0
    }

    AsyncFunction("start") {
      intervalCount = 0
      totalCount = 0
      last = 0L
      running = true
      Choreographer.getInstance().postFrameCallback(frame)
      window = appContext.currentActivity?.window?.also {
        it.addOnFrameMetricsAvailableListener(metrics, Handler(metricsThread.looper))
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") {
      running = false
      Choreographer.getInstance().removeFrameCallback(frame)
      runCatching { window?.removeOnFrameMetricsAvailableListener(metrics) }
      window = null
      mapOf(
        "intervalsMs" to intervals.copyOf(intervalCount).map { it.toDouble() },
        "frameTotalsMs" to totals.copyOf(totalCount).map { it.toDouble() },
      )
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("memory") {
      val info = Debug.MemoryInfo()
      Debug.getMemoryInfo(info)
      val am = appContext.reactContext?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      val low = ActivityManager.MemoryInfo().also { am?.getMemoryInfo(it) }
      mapOf(
        "residentMb" to info.totalPss / 1024.0,
        "nativeHeapMb" to Debug.getNativeHeapAllocatedSize() / 1048576.0,
        "graphicsMb" to (info.getMemoryStat("summary.graphics")?.toDoubleOrNull() ?: 0.0) / 1024.0,
        "lowMemory" to low.lowMemory,
      )
    }
  }

  private companion object {
    const val MAX = 20_000
  }
}
