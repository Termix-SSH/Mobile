package expo.modules.termixdisplay

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.view.KeyEvent
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/** Draws a frame scaled and panned. Touch goes to React's responders on this view; keys come here. */
class TermixDisplayView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onKey by EventDispatcher<Map<String, Any>>()

  private var frame: FrameBuffer? = null
  private var frameId: String? = null
  private var bitmap: Bitmap? = null
  private var scale = 1f
  private var offsetX = 0f
  private var offsetY = 0f
  private val matrix = Matrix()
  private val paint = Paint(Paint.FILTER_BITMAP_FLAG)

  private val canvasView = object : View(context) {
    override fun onDraw(canvas: Canvas) {
      canvas.drawColor(0xff000000.toInt())
      val bmp = bitmap ?: return
      matrix.setScale(scale, scale)
      matrix.postTranslate(-offsetX * scale, -offsetY * scale)
      canvas.drawBitmap(bmp, matrix, paint)
    }
  }

  private val listener = FrameListener { canvasView.post { pull() } }

  init {
    addView(canvasView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    isFocusable = true
    isFocusableInTouchMode = true
  }

  fun setFrameId(id: String?) {
    if (id == frameId) return
    frame?.setListener(null)
    frameId = id
    frame = id?.let { TermixFrames.get(it) }
    frame?.setListener(listener)
    frame?.markAll()
    pull()
  }

  fun setPlacement(scale: Float, offsetX: Float, offsetY: Float) {
    this.scale = scale
    this.offsetX = offsetX
    this.offsetY = offsetY
    canvasView.invalidate()
  }

  // Copies the changed area into the bitmap on the UI thread.
  private fun pull() {
    val f = frame ?: return
    if (f.width == 0 || f.height == 0) return
    if (bitmap?.width != f.width || bitmap?.height != f.height) {
      bitmap?.recycle()
      bitmap = Bitmap.createBitmap(f.width, f.height, Bitmap.Config.ARGB_8888)
      f.markAll()
    }
    val bmp = bitmap ?: return
    f.takeDirty { area, pixels, stride ->
      if (area.x + area.width <= bmp.width && area.y + area.height <= bmp.height) {
        bmp.setPixels(pixels, area.y * stride + area.x, stride, area.x, area.y, area.width, area.height)
      }
    }
    canvasView.invalidate()
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action != KeyEvent.ACTION_DOWN && event.action != KeyEvent.ACTION_UP) {
      return super.dispatchKeyEvent(event)
    }
    onKey(
      mapOf(
        "key" to KeyEvent.keyCodeToString(event.keyCode).removePrefix("KEYCODE_"),
        "char" to event.getUnicodeChar(event.metaState and KeyEvent.META_CTRL_MASK.inv()),
        "down" to (event.action == KeyEvent.ACTION_DOWN),
      ),
    )
    return true
  }

  fun destroy() {
    frame?.setListener(null)
    frame = null
    bitmap?.recycle()
    bitmap = null
  }
}
