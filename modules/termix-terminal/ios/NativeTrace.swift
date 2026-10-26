import Foundation
import GhosttyTerminal

/// Native lines for chasing a bug with a user. JS drains them into Settings, Logs.
enum NativeTrace {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var lines: [String] = []
  nonisolated(unsafe) private static var started = false
  private static let limit = 2000

  static func log(_ line: String) {
    let stamp = String(format: "%.3f", Date().timeIntervalSince1970)
    lock.lock()
    lines.append("\(stamp) \(line)")
    if lines.count > limit { lines.removeFirst(lines.count - limit) }
    lock.unlock()
  }

  static func take() -> [String] {
    lock.lock()
    defer { lock.unlock() }
    let out = lines
    lines = []
    return out
  }

  /// Turns on the library's own log too. Output and input stay off: they carry what is typed.
  static func start() {
    lock.lock()
    let first = !started
    started = true
    lock.unlock()
    guard first else { return }
    TerminalDebugLog.sink = { NativeTrace.log($0) }
    TerminalDebugLog.enable([.lifecycle, .metrics, .actions])
  }
}
