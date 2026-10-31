package expo.modules.termixdisplay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FrameBufferTest {
  @Test
  fun blitConvertsRgbaAndTracksDirtyArea() {
    val f = FrameBuffer()
    f.resize(3, 2)
    f.takeDirty { _, _, _ -> }
    f.blit(1, 1, 1, 1, byteArrayOf(0x10, 0x20, 0x30, 0xff.toByte()))
    f.blit(2, 0, 1, 1, byteArrayOf(1, 2, 3, 4))
    val area = f.takeDirty { a, px, stride ->
      assertEquals(0xff102030.toInt(), px[1 * stride + 1])
      assertEquals(0x04010203, px[2])
      a
    }
    assertEquals(Dirty(1, 0, 2, 2), area)
    assertNull(f.takeDirty { a, _, _ -> a })
  }

  @Test
  fun clipsAndIgnoresBadRects() {
    val f = FrameBuffer()
    f.resize(2, 2)
    f.takeDirty { _, _, _ -> }
    f.blit(1, 1, 2, 2, ByteArray(16) { 7 })
    assertEquals(Dirty(1, 1, 1, 1), f.takeDirty { a, _, _ -> a })
    f.blit(5, 5, 1, 1, ByteArray(4))
    f.blit(0, 0, 2, 2, ByteArray(3))
    assertNull(f.takeDirty { a, _, _ -> a })
  }

  @Test
  fun listenerHearsChangesAndRegistrySharesFrames() {
    var calls = 0
    val f = TermixFrames.get("t")
    f.setListener { calls++ }
    TermixFrames.get("t").resize(1, 1)
    f.blit(0, 0, 1, 1, ByteArray(4))
    assertEquals(2, calls)
    TermixFrames.release("t")
    // A released id starts over with an empty frame.
    assertEquals(0, TermixFrames.get("t").width)
    TermixFrames.release("t")
  }
}
