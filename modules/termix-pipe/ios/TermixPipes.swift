import Foundation

/// Something that can stop sending for a while, like an SSH shell reader.
public protocol PipeProducer: AnyObject {
  func pause()
  func resume()
}

/// Told when bytes are waiting. It reads them with `BytePipe.read` on its own queue.
public protocol PipeSink: AnyObject {
  func pipeReadable()
}

/// A byte queue between a producer and a terminal view. Above `high` queued bytes the producer is
/// paused, below `low` it is resumed, so a slow view holds back the network instead of memory.
public final class BytePipe: @unchecked Sendable {
  public static let highWater = 1 << 20
  public static let lowWater = 256 * 1024

  public let high: Int
  public let low: Int
  private let lock = NSLock()
  private var chunks: [Data] = []
  private var headOffset = 0
  private weak var producer: PipeProducer?
  private weak var sink: PipeSink?
  private var paused = false
  private var count = 0
  private var holds = 0

  public init(high: Int = BytePipe.highWater, low: Int = BytePipe.lowWater) {
    self.high = high
    self.low = low
  }

  public var queued: Int {
    lock.lock()
    defer { lock.unlock() }
    return count
  }

  public func push(_ data: Data) {
    if data.isEmpty { return }
    lock.lock()
    chunks.append(data)
    count += data.count
    var pause: PipeProducer?
    if !paused && count >= high {
      paused = true
      pause = producer
    }
    let notify = sink
    lock.unlock()
    pause?.pause()
    notify?.pipeReadable()
  }

  /// Takes up to `max` bytes, or nil when nothing is queued.
  public func read(max: Int) -> Data? {
    lock.lock()
    if count == 0 {
      lock.unlock()
      return nil
    }
    let size = min(max, count)
    var out = Data(capacity: size)
    while out.count < size {
      let head = chunks[0]
      let start = head.startIndex + headOffset
      let take = min(size - out.count, head.count - headOffset)
      out.append(head[start..<(start + take)])
      headOffset += take
      if headOffset == head.count {
        chunks.removeFirst()
        headOffset = 0
      }
    }
    count -= size
    var resume: PipeProducer?
    if paused && count <= low {
      paused = false
      resume = producer
    }
    lock.unlock()
    resume?.resume()
    return out
  }

  public func setProducer(_ value: PipeProducer?) {
    lock.lock()
    producer = value
    let apply = paused ? value : nil
    lock.unlock()
    apply?.pause()
  }

  public func setSink(_ value: PipeSink?) {
    lock.lock()
    sink = value
    let notify = count > 0 ? value : nil
    lock.unlock()
    notify?.pipeReadable()
  }

  /// Clears the sink only if it is still `value`, so a new view is never cut off by an old one.
  public func detachSink(_ value: PipeSink) {
    lock.lock()
    if sink === value { sink = nil }
    lock.unlock()
  }

  /// Same as `detachSink` for producers.
  public func detachProducer(_ value: PipeProducer) {
    lock.lock()
    if producer === value { producer = nil }
    lock.unlock()
  }

  /// Drops queued bytes, for a fresh connection.
  public func clear() {
    lock.lock()
    chunks.removeAll()
    headOffset = 0
    count = 0
    var resume: PipeProducer?
    if paused {
      paused = false
      resume = producer
    }
    lock.unlock()
    resume?.resume()
  }

  /// Keeps the pipe alive while a shell still writes to it, before its producer is set.
  public func hold() {
    lock.lock()
    holds += 1
    lock.unlock()
  }

  public func unhold() {
    lock.lock()
    if holds > 0 { holds -= 1 }
    lock.unlock()
  }

  var isUnused: Bool {
    lock.lock()
    defer { lock.unlock() }
    return holds == 0 && producer == nil && sink == nil && count == 0
  }
}

/// Process wide pipes by id, so the SSH module and the terminal view meet without JS.
public enum TermixPipes {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var pipes: [String: BytePipe] = [:]

  public static func get(_ id: String) -> BytePipe {
    lock.lock()
    defer { lock.unlock() }
    if let pipe = pipes[id] { return pipe }
    let pipe = BytePipe()
    pipes[id] = pipe
    return pipe
  }

  /// Forgets the pipe once neither side uses it and it is drained.
  public static func release(_ id: String) {
    lock.lock()
    defer { lock.unlock() }
    if pipes[id]?.isUnused == true { pipes.removeValue(forKey: id) }
  }
}
