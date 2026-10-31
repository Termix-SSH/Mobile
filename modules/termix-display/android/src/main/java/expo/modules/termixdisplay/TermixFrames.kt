package expo.modules.termixdisplay

/** Told when part of a frame changed. Called on the engine's thread. */
fun interface FrameListener {
  fun onFrameChanged()
}

/** A changed area, right and bottom exclusive. */
data class Dirty(val x: Int, val y: Int, val width: Int, val height: Int)

/**
 * A remote desktop's pixels as ARGB ints, ready for a Bitmap. The engine writes RGBA rectangles,
 * the view takes the changed area and draws it.
 */
class FrameBuffer {
  private val lock = Object()
  private var listener: FrameListener? = null
  private var dirty: Dirty? = null

  var width = 0
    private set
  var height = 0
    private set
  var pixels = IntArray(0)
    private set

  fun resize(w: Int, h: Int) {
    val notify: FrameListener?
    synchronized(lock) {
      width = maxOf(0, w)
      height = maxOf(0, h)
      pixels = IntArray(width * height)
      dirty = Dirty(0, 0, width, height)
      notify = listener
    }
    notify?.onFrameChanged()
  }

  /** Copies `w * h` RGBA pixels to (x, y), clipped to the frame. */
  fun blit(x: Int, y: Int, w: Int, h: Int, rgba: ByteArray) {
    val notify: FrameListener?
    synchronized(lock) {
      val x2 = minOf(width, x + w)
      val y2 = minOf(height, y + h)
      if (x < 0 || y < 0 || x >= x2 || y >= y2 || rgba.size < w * h * 4) return
      for (row in y until y2) {
        var s = (row - y) * w * 4
        var d = row * width + x
        for (col in x until x2) {
          val r = rgba[s].toInt() and 0xff
          val g = rgba[s + 1].toInt() and 0xff
          val b = rgba[s + 2].toInt() and 0xff
          val a = rgba[s + 3].toInt() and 0xff
          pixels[d] = (a shl 24) or (r shl 16) or (g shl 8) or b
          s += 4
          d++
        }
      }
      dirty = merge(dirty, Dirty(x, y, x2 - x, y2 - y))
      notify = listener
    }
    notify?.onFrameChanged()
  }

  /** Takes the changed area and runs [draw] with the pixels locked, so they can't change mid copy. */
  fun <T> takeDirty(draw: (Dirty, IntArray, Int) -> T): T? = synchronized(lock) {
    val area = dirty ?: return null
    dirty = null
    draw(area, pixels, width)
  }

  /** Marks everything as changed, for a view that just attached. */
  fun markAll() {
    synchronized(lock) { dirty = Dirty(0, 0, width, height) }
  }

  fun setListener(value: FrameListener?) {
    synchronized(lock) { listener = value }
  }

  companion object {
    fun merge(a: Dirty?, b: Dirty): Dirty {
      if (a == null) return b
      val x = minOf(a.x, b.x)
      val y = minOf(a.y, b.y)
      return Dirty(x, y, maxOf(a.x + a.width, b.x + b.width) - x, maxOf(a.y + a.height, b.y + b.height) - y)
    }
  }
}

/** Process wide frames, so the engine and the view meet by id without JS. */
object TermixFrames {
  private val frames = HashMap<String, FrameBuffer>()

  @Synchronized
  fun get(id: String): FrameBuffer = frames.getOrPut(id) { FrameBuffer() }

  @Synchronized
  fun release(id: String) {
    frames.remove(id)
  }
}
