package expo.modules.termixterminalghostty

/** Render cost per frame for the terminal lab readout. Main thread only. */
internal class RenderStats {
  private val samples = LongArray(600)
  private var count = 0
  private var next = 0
  var frames = 0L
    private set
  var bytes = 0L

  fun recordRender(nanos: Long) {
    samples[next] = nanos
    next = (next + 1) % samples.size
    if (count < samples.size) count++
    frames++
  }

  fun snapshot(): Map<String, Any> {
    val sorted = samples.copyOf(count).also { it.sort() }
    fun pct(p: Double): Double =
      if (count == 0) 0.0 else sorted[((p * count).toInt()).coerceIn(0, count - 1)] / 1e6
    return mapOf(
      "renderedFrames" to frames.toDouble(),
      "renderMsP50" to pct(0.5),
      "renderMsP95" to pct(0.95),
      "renderMsMax" to if (count == 0) 0.0 else sorted[count - 1] / 1e6,
      "bytesParsed" to bytes.toDouble(),
    )
  }
}
