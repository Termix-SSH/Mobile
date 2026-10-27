import Foundation

/// Trace only: copies ghostty's warning and error log lines from stderr to the JS trace log.
/// Everything still goes to the real stderr too.
enum TermixStderr {
  nonisolated(unsafe) private static var started = false
  private static let lock = NSLock()
  nonisolated(unsafe) private static var pending: [String] = []
  nonisolated(unsafe) static var sink: (([String]) -> Void)?

  static func start() {
    lock.lock()
    defer { lock.unlock() }
    guard !started else { return }
    started = true
    var fds: [Int32] = [0, 0]
    guard pipe(&fds) == 0 else { return }
    let original = dup(STDERR_FILENO)
    guard original >= 0, dup2(fds[1], STDERR_FILENO) >= 0 else { return }
    let readEnd = fds[0]
    Thread.detachNewThread {
      var buffer = [UInt8](repeating: 0, count: 4096)
      var line = Data()
      while true {
        let count = read(readEnd, &buffer, buffer.count)
        if count <= 0 { break }
        _ = buffer.withUnsafeBytes { write(original, $0.baseAddress, count) }
        for byte in buffer[0..<count] {
          if byte == 10 {
            if let text = String(data: line, encoding: .utf8), wanted(text) { forward(text) }
            line.removeAll(keepingCapacity: true)
          } else if line.count < 2000 {
            line.append(byte)
          }
        }
      }
    }
  }

  private static func wanted(_ text: String) -> Bool {
    let lower = text.lowercased()
    return lower.contains("warning(") || lower.contains("error(") || lower.contains("io thread")
      || lower.contains("termio")
  }

  private static func forward(_ text: String) {
    lock.lock()
    pending.append(text)
    if pending.count > 200 { pending.removeFirst(pending.count - 200) }
    lock.unlock()
    DispatchQueue.main.async { flush() }
  }

  /// Sends the waiting lines once a terminal view can carry them.
  static func flush() {
    guard let sink else { return }
    lock.lock()
    let lines = pending
    pending.removeAll()
    lock.unlock()
    if !lines.isEmpty { sink(lines) }
  }
}
