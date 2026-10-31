import Foundation
import Network

enum LanProbe {
  /// True when a TCP connection opens within the time.
  static func tcp(host: String, port: Int, timeoutMs: Int, done: @escaping (Bool) -> Void) {
    guard let nwPort = NWEndpoint.Port(rawValue: UInt16(clamping: port)), port > 0 else {
      done(false)
      return
    }
    let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: .tcp)
    let queue = DispatchQueue(label: "termix.net.probe")
    var finished = false
    let finish = { (ok: Bool) in
      if finished { return }
      finished = true
      connection.cancel()
      done(ok)
    }
    connection.stateUpdateHandler = { state in
      switch state {
      case .ready: finish(true)
      case .failed, .cancelled: finish(false)
      default: break
      }
    }
    connection.start(queue: queue)
    queue.asyncAfter(deadline: .now() + .milliseconds(max(timeoutMs, 100))) { finish(false) }
  }

  /// Sends one UDP datagram with the broadcast flag on, like a wake packet.
  static func udp(host: String, port: Int, data: Data) throws {
    let fd = socket(AF_INET, SOCK_DGRAM, 0)
    if fd < 0 { throw LanError.failed("Could not open a socket") }
    defer { close(fd) }
    var on: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_BROADCAST, &on, socklen_t(MemoryLayout<Int32>.size))
    var addr = sockaddr_in()
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = in_port_t(UInt16(clamping: port)).bigEndian
    if inet_pton(AF_INET, host, &addr.sin_addr) != 1 {
      throw LanError.failed("The broadcast address is not an IPv4 address")
    }
    let sent = data.withUnsafeBytes { raw in
      withUnsafePointer(to: &addr) { ptr in
        ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
          sendto(fd, raw.baseAddress, data.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
      }
    }
    if sent < 0 { throw LanError.failed(String(cString: strerror(errno))) }
  }
}

enum LanError: Error {
  case failed(String)
}
