package expo.modules.termixpipe

/** Something that can stop sending for a while, like an SSH shell reader. */
interface PipeProducer {
  fun pause()
  fun resume()
}

/** Told when bytes are waiting. It reads them with [BytePipe.read] on its own thread. */
fun interface PipeSink {
  fun onReadable()
}

/**
 * A byte queue between a producer and a terminal view. Above [high] queued bytes the producer is
 * paused, below [low] it is resumed, so a slow view holds back the network instead of memory.
 */
class BytePipe(val high: Int = HIGH_WATER, val low: Int = LOW_WATER) {
  private val lock = Object()
  private val chunks = ArrayDeque<ByteArray>()
  private var headOffset = 0
  private var producer: PipeProducer? = null
  private var sink: PipeSink? = null
  private var paused = false
  private var holds = 0

  var queued = 0
    private set

  fun push(data: ByteArray) {
    if (data.isEmpty()) return
    val notify: PipeSink?
    var pause: PipeProducer? = null
    synchronized(lock) {
      chunks.addLast(data)
      queued += data.size
      if (!paused && queued >= high) {
        paused = true
        pause = producer
      }
      notify = sink
    }
    pause?.pause()
    notify?.onReadable()
  }

  /** Takes up to [max] bytes, or null when nothing is queued. */
  fun read(max: Int): ByteArray? {
    var resume: PipeProducer? = null
    val out: ByteArray
    synchronized(lock) {
      if (queued == 0) return null
      val size = minOf(max, queued)
      out = ByteArray(size)
      var filled = 0
      while (filled < size) {
        val head = chunks.first()
        val take = minOf(size - filled, head.size - headOffset)
        System.arraycopy(head, headOffset, out, filled, take)
        filled += take
        headOffset += take
        if (headOffset == head.size) {
          chunks.removeFirst()
          headOffset = 0
        }
      }
      queued -= size
      if (paused && queued <= low) {
        paused = false
        resume = producer
      }
    }
    resume?.resume()
    return out
  }

  fun setProducer(value: PipeProducer?) {
    var apply: PipeProducer? = null
    synchronized(lock) {
      producer = value
      if (paused) apply = value
    }
    apply?.pause()
  }

  fun setSink(value: PipeSink?) {
    val notify: PipeSink?
    synchronized(lock) {
      sink = value
      notify = if (queued > 0) value else null
    }
    notify?.onReadable()
  }

  /** Clears the sink only if it is still [value], so a new view is never cut off by an old one. */
  fun detachSink(value: PipeSink) {
    synchronized(lock) {
      if (sink === value) sink = null
    }
  }

  /** Same as [detachSink] for producers. */
  fun detachProducer(value: PipeProducer) {
    synchronized(lock) {
      if (producer === value) producer = null
    }
  }

  /** Drops queued bytes, for a fresh connection. */
  fun clear() {
    var resume: PipeProducer? = null
    synchronized(lock) {
      chunks.clear()
      headOffset = 0
      queued = 0
      if (paused) {
        paused = false
        resume = producer
      }
    }
    resume?.resume()
  }

  /** Keeps the pipe alive while a shell still writes to it, before its producer is set. */
  fun hold() {
    synchronized(lock) { holds++ }
  }

  fun unhold() {
    synchronized(lock) { if (holds > 0) holds-- }
  }

  internal val isEmpty: Boolean
    get() = synchronized(lock) { holds == 0 && producer == null && sink == null && queued == 0 }

  companion object {
    const val HIGH_WATER = 1 shl 20
    const val LOW_WATER = 256 * 1024
  }
}

/** Process wide pipes by id, so the SSH module and the terminal view meet without JS. */
object TermixPipes {
  private val pipes = HashMap<String, BytePipe>()

  fun get(id: String): BytePipe = synchronized(pipes) { pipes.getOrPut(id) { BytePipe() } }

  /** Forgets the pipe once neither side uses it and it is drained. */
  fun release(id: String) {
    synchronized(pipes) {
      if (pipes[id]?.isEmpty == true) pipes.remove(id)
    }
  }

  internal fun count(): Int = synchronized(pipes) { pipes.size }
}
