package expo.modules.termixpipe

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PipeTest {
  private class Producer : PipeProducer {
    val calls = mutableListOf<String>()
    override fun pause() {
      calls += "pause"
    }
    override fun resume() {
      calls += "resume"
    }
  }

  @Test
  fun readsAcrossChunks() {
    val pipe = BytePipe()
    pipe.push(byteArrayOf(1, 2, 3))
    pipe.push(byteArrayOf(4, 5))
    assertArrayEquals(byteArrayOf(1, 2), pipe.read(2))
    assertArrayEquals(byteArrayOf(3, 4, 5), pipe.read(10))
    assertNull(pipe.read(10))
  }

  @Test
  fun pausesAboveHighAndResumesBelowLow() {
    val pipe = BytePipe(high = 10, low = 4)
    val producer = Producer()
    pipe.setProducer(producer)
    pipe.push(ByteArray(6))
    assertEquals(emptyList<String>(), producer.calls)
    pipe.push(ByteArray(6))
    assertEquals(listOf("pause"), producer.calls)
    pipe.push(ByteArray(6))
    assertEquals(listOf("pause"), producer.calls)
    pipe.read(10)
    assertEquals(listOf("pause"), producer.calls)
    pipe.read(4)
    assertEquals(listOf("pause", "resume"), producer.calls)
  }

  @Test
  fun newProducerStartsPausedWhenFull() {
    val pipe = BytePipe(high = 4, low = 1)
    pipe.push(ByteArray(5))
    val producer = Producer()
    pipe.setProducer(producer)
    assertEquals(listOf("pause"), producer.calls)
  }

  @Test
  fun sinkHearsAboutWaitingBytes() {
    val pipe = BytePipe()
    var told = 0
    pipe.push(byteArrayOf(1))
    pipe.setSink { told++ }
    assertEquals(1, told)
    pipe.push(byteArrayOf(2))
    assertEquals(2, told)
  }

  @Test
  fun clearDropsBytesAndResumes() {
    val pipe = BytePipe(high = 2, low = 0)
    val producer = Producer()
    pipe.setProducer(producer)
    pipe.push(ByteArray(3))
    pipe.clear()
    assertEquals(0, pipe.queued)
    assertEquals(listOf("pause", "resume"), producer.calls)
  }

  @Test
  fun releaseKeepsPipesInUse() {
    val pipe = TermixPipes.get("a")
    pipe.setSink { }
    TermixPipes.release("a")
    assertEquals(pipe, TermixPipes.get("a"))
    pipe.setSink(null)
    TermixPipes.release("a")
    assertEquals(0, TermixPipes.count())
  }
}
