import Foundation
import Security

/**
 Data and network for the Power widget.

 The app writes the device list into the App Group and each server's base URL
 and headers into the shared keychain item (see `src/widgets/power.ts`). The
 widget then talks to the Wake-on-LAN plugin itself, so a tap works with the
 app closed.
 */

enum PowerStatus: String, Codable {
  case unknown
  case online
  case offline
  case waking
  case stopping
  case failed

  init(from decoder: Decoder) throws {
    let raw = try decoder.singleValueContainer().decode(String.self)
    self = PowerStatus(rawValue: raw) ?? .unknown
  }

  /// Waking or shutting down: the widget checks back soon.
  var isMoving: Bool { self == .waking || self == .stopping }

  var label: String {
    switch self {
    case .online: return "ONLINE"
    case .offline: return "OFFLINE"
    case .waking: return "WAKING"
    case .stopping: return "SHUTTING DOWN"
    case .failed: return "FAILED"
    case .unknown: return "CHECKING"
    }
  }
}

struct PowerDevice: Codable, Hashable, Identifiable {
  let key: String
  let accountId: String
  let hostId: Int
  let name: String
  let address: String
  let server: String
  let status: PowerStatus
  let canWake: Bool
  let canShutdown: Bool
  let confirmShutdown: Bool

  var id: String { key }

  static let placeholder = PowerDevice(
    key: "preview:1", accountId: "preview", hostId: 1, name: "Desktop",
    address: "192.168.1.20", server: "termix.local", status: .offline,
    canWake: true, canShutdown: true, confirmShutdown: false
  )
}

struct PowerSnapshot: Codable {
  static let supportedVersion = 1

  let version: Int
  let updatedAt: Double
  let devices: [PowerDevice]
}

struct PowerAccess: Decodable {
  let base: String
  let headers: [String: String]
}

/// What the widget changed or learned since the app last published.
struct PowerLocalState: Codable {
  struct Pending: Codable {
    let status: PowerStatus
    /// Status at the tap. The pending state shows until the server moves off it.
    let from: PowerStatus
    let until: Double
  }

  struct Notice: Codable {
    let text: String
    let until: Double
  }

  struct Live: Codable {
    let status: PowerStatus
    let at: Double
  }

  /// Statuses the widget fetched itself, newer than the app's when `at` is.
  var live: [String: Live] = [:]
  var pending: [String: Pending] = [:]
  /// Shutdown asked once, waiting for the second tap.
  var armed: [String: Double] = [:]
  var notices: [String: Notice] = [:]
}

enum PowerStore {
  /// Must match `TermixWidgetsModule` in the app target.
  static let snapshotKey = "termix.widget.power.v1"
  static let localKey = "termix.widget.power.overrides.v1"
  private static let keychainService = "termix.widget.power"
  private static let keychainAccount = "access"

  /// How long a wake or shutdown shows as in progress at most.
  static let pendingSeconds: TimeInterval = 180
  /// How long a first shutdown tap waits for the second.
  static let armSeconds: TimeInterval = 6

  private static var defaults: UserDefaults? {
    SharedStore.appGroupId.flatMap { UserDefaults(suiteName: $0) }
  }

  static func loadSnapshot() -> PowerSnapshot? {
    guard
      let json = defaults?.string(forKey: snapshotKey),
      let data = json.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(PowerSnapshot.self, from: data),
      snapshot.version == PowerSnapshot.supportedVersion
    else {
      return nil
    }
    return snapshot
  }

  static func devices() -> [PowerDevice] { loadSnapshot()?.devices ?? [] }

  static func device(key: String?) -> PowerDevice? {
    let all = devices()
    guard let key else { return all.first }
    return all.first { $0.key == key }
  }

  static func loadLocal() -> PowerLocalState {
    guard
      let data = defaults?.data(forKey: localKey),
      let state = try? JSONDecoder().decode(PowerLocalState.self, from: data)
    else {
      return PowerLocalState()
    }
    return state
  }

  static func saveLocal(_ state: PowerLocalState) {
    guard let data = try? JSONEncoder().encode(state) else { return }
    defaults?.set(data, forKey: localKey)
  }

  static func access(accountId: String) -> PowerAccess? {
    guard let groupId = SharedStore.appGroupId else { return nil }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecAttrAccessGroup as String: groupId,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard
      SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data,
      let map = try? JSONDecoder().decode([String: String].self, from: data),
      let json = map[accountId]?.data(using: .utf8)
    else {
      return nil
    }
    return try? JSONDecoder().decode(PowerAccess.self, from: json)
  }

  /// Status to show, from what the server said last and what the widget did.
  static func status(
    of device: PowerDevice,
    local: PowerLocalState,
    publishedAt: Double = loadSnapshot()?.updatedAt ?? 0,
    now: Date = Date()
  ) -> PowerStatus {
    var known = device.status
    if let live = local.live[device.key], live.at * 1000 > publishedAt {
      known = live.status
    }
    if let pending = local.pending[device.key], now.timeIntervalSince1970 < pending.until {
      if known == pending.from || known.isMoving || known == .unknown { return pending.status }
    }
    return known
  }

  // MARK: - Network

  enum PowerError: LocalizedError {
    case noAccess
    case server(String)

    var errorDescription: String? {
      switch self {
      case .noAccess: return "Open Termix"
      case let .server(message): return message
      }
    }
  }

  private static let session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 10
    config.httpShouldSetCookies = false
    return URLSession(configuration: config)
  }()

  private static func makeRequest(_ device: PowerDevice, path: String, method: String) throws -> URLRequest {
    guard
      let access = Self.access(accountId: device.accountId),
      let url = URL(string: "\(access.base)/plugin-api/wake-on-lan\(path)")
    else {
      throw PowerError.noAccess
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    for (name, value) in access.headers {
      request.setValue(value, forHTTPHeaderField: name)
    }
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if method == "POST" {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = Data("{}".utf8)
    }
    return request
  }

  private struct StatusBody: Decodable {
    struct Row: Decodable {
      let hostId: Int
      let status: PowerStatus
    }
    let statuses: [Row]
  }

  private struct ErrorBody: Decodable {
    let error: String?
  }

  /// Live status of one device, or nil when the server can't be reached.
  static func fetchStatus(_ device: PowerDevice) async -> PowerStatus? {
    guard
      let request = try? makeRequest(device, path: "/status", method: "GET"),
      let (data, response) = try? await session.data(for: request),
      (response as? HTTPURLResponse)?.statusCode == 200,
      let body = try? JSONDecoder().decode(StatusBody.self, from: data)
    else {
      return nil
    }
    return body.statuses.first { $0.hostId == device.hostId }?.status
  }

  /// Sends "wake" or "shutdown".
  static func send(_ device: PowerDevice, action: String) async throws {
    let request = try makeRequest(device, path: "/devices/\(device.hostId)/\(action)", method: "POST")
    let (data, response) = try await session.data(for: request)
    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(code) else {
      if code == 401 { throw PowerError.server("Open Termix to sign in") }
      let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
      throw PowerError.server(message ?? "Failed (\(code))")
    }
  }

  /**
   What a tap does: wake when off, shut down when on. A device set to ask
   before a shutdown needs a second tap within a few seconds.
   */
  static func toggle(key: String) async {
    guard let device = Self.device(key: key) else { return }
    var local = loadLocal()
    let now = Date().timeIntervalSince1970
    let current = status(of: device, local: local)
    local.notices.removeValue(forKey: key)

    if current.isMoving {
      saveLocal(local)
      return
    }

    let action: String
    let next: PowerStatus
    if current == .online {
      guard device.canShutdown else {
        local.notices[key] = .init(text: "No shutdown access", until: now + 8)
        saveLocal(local)
        return
      }
      if device.confirmShutdown, (local.armed[key] ?? 0) <= now {
        local.armed[key] = now + armSeconds
        saveLocal(local)
        return
      }
      action = "shutdown"
      next = .stopping
    } else {
      guard device.canWake else {
        local.notices[key] = .init(text: "No wake access", until: now + 8)
        saveLocal(local)
        return
      }
      action = "wake"
      next = .waking
    }
    local.armed.removeValue(forKey: key)
    // Show the change right away, before the server answers.
    local.pending[key] = .init(status: next, from: current, until: now + pendingSeconds)
    saveLocal(local)

    do {
      try await send(device, action: action)
    } catch {
      var after = loadLocal()
      after.pending.removeValue(forKey: key)
      after.notices[key] = .init(
        text: error.localizedDescription, until: Date().timeIntervalSince1970 + 10
      )
      saveLocal(after)
    }
  }
}
