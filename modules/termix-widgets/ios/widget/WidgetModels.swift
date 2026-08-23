import Foundation

/**
 Decoders for the snapshot the app publishes.

 The shape is defined once in `app/widgets/types.ts`; this file mirrors it.
 Every field is decoded defensively: a widget must render *something* even if a
 future app version adds fields or a payload arrives half-written.
 */

enum HostStatus: String, Codable {
  case online
  case offline
  case unknown

  init(from decoder: Decoder) throws {
    let raw = try decoder.singleValueContainer().decode(String.self)
    self = HostStatus(rawValue: raw) ?? .unknown
  }
}

enum SnapshotState: String, Codable {
  case ready
  case empty
  case signedOut = "signed-out"

  init(from decoder: Decoder) throws {
    let raw = try decoder.singleValueContainer().decode(String.self)
    self = SnapshotState(rawValue: raw) ?? .signedOut
  }
}

struct HostEntry: Codable, Identifiable, Hashable {
  let id: Int
  let name: String
  let subtitle: String
  let folder: String
  let status: HostStatus
  let cpu: Int?
  let mem: Int?
  let pinned: Bool
  let url: String

  /// Deep link for this host, or the generic "open the app" link as a fallback.
  var link: URL {
    URL(string: url) ?? WidgetSnapshot.fallbackLink
  }

  /// Spoken description — the visual status dot and bars carry no text.
  var accessibilityDescription: String {
    let state: String
    switch status {
    case .online: state = "online"
    case .offline: state = "offline"
    case .unknown: state = "status unknown"
    }

    var description = "\(name), \(state)"
    if status == .online, let cpu {
      description += ", CPU \(cpu) percent, memory \(mem ?? 0) percent"
    }
    return description + ". Opens a terminal session."
  }
}

struct SnippetEntry: Codable, Identifiable, Hashable {
  let id: Int
  let name: String
  let folder: String
  let preview: String
  let url: String

  var link: URL {
    URL(string: url) ?? WidgetSnapshot.fallbackLink
  }
}

struct HostSummary: Codable, Hashable {
  let total: Int
  let online: Int
  let offline: Int
  let unknown: Int

  static let zero = HostSummary(total: 0, online: 0, offline: 0, unknown: 0)
}

struct WidgetSnapshot: Codable, Hashable {
  /// Payload version understood by this build. Newer payloads are ignored.
  static let supportedVersion = 1
  static let fallbackLink = URL(string: "termix-mobile://widget/open")!
  /// Opens the snippets list without copying anything.
  static let snippetsLink = URL(string: "termix-mobile://widget/snippets")!

  let version: Int
  let updatedAt: Double
  let state: SnapshotState
  let accent: String
  let server: String
  let summary: HostSummary
  let hosts: [HostEntry]
  let snippets: [SnippetEntry]

  private enum CodingKeys: String, CodingKey {
    case version, updatedAt, state, accent, server, summary, hosts, snippets
  }

  init(
    version: Int,
    updatedAt: Double,
    state: SnapshotState,
    accent: String,
    server: String,
    summary: HostSummary,
    hosts: [HostEntry],
    snippets: [SnippetEntry]
  ) {
    self.version = version
    self.updatedAt = updatedAt
    self.state = state
    self.accent = accent
    self.server = server
    self.summary = summary
    self.hosts = hosts
    self.snippets = snippets
  }

  /// Tolerant decoding: a missing collection is empty rather than fatal, so a
  /// payload from a slightly different app build still renders.
  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    version = try container.decodeIfPresent(Int.self, forKey: .version) ?? -1
    updatedAt = try container.decodeIfPresent(Double.self, forKey: .updatedAt) ?? 0
    state = try container.decodeIfPresent(SnapshotState.self, forKey: .state) ?? .signedOut
    accent = try container.decodeIfPresent(String.self, forKey: .accent) ?? "#f59145"
    server = try container.decodeIfPresent(String.self, forKey: .server) ?? ""
    summary = try container.decodeIfPresent(HostSummary.self, forKey: .summary) ?? .zero
    hosts = try container.decodeIfPresent([HostEntry].self, forKey: .hosts) ?? []
    snippets = try container.decodeIfPresent([SnippetEntry].self, forKey: .snippets) ?? []
  }

  var updatedDate: Date {
    Date(timeIntervalSince1970: updatedAt / 1000)
  }

  /// Shown before any snapshot exists and in the widget gallery.
  static let placeholder = WidgetSnapshot(
    version: supportedVersion,
    updatedAt: Date().timeIntervalSince1970 * 1000,
    state: .ready,
    accent: "#f59145",
    server: "termix.local",
    summary: HostSummary(total: 4, online: 3, offline: 1, unknown: 0),
    hosts: [
      HostEntry(id: 1, name: "web-01", subtitle: "root@10.0.0.11", folder: "Production",
                status: .online, cpu: 34, mem: 61, pinned: true,
                url: "termix-mobile://widget/connect?hostId=1&type=terminal"),
      HostEntry(id: 2, name: "db-primary", subtitle: "postgres@10.0.0.12", folder: "Production",
                status: .online, cpu: 72, mem: 48, pinned: false,
                url: "termix-mobile://widget/connect?hostId=2&type=terminal"),
      HostEntry(id: 3, name: "build-runner", subtitle: "ci@10.0.0.21", folder: "CI",
                status: .online, cpu: 12, mem: 22, pinned: false,
                url: "termix-mobile://widget/connect?hostId=3&type=terminal"),
      HostEntry(id: 4, name: "backup-nas", subtitle: "admin@10.0.0.30", folder: "Storage",
                status: .offline, cpu: nil, mem: nil, pinned: false,
                url: "termix-mobile://widget/connect?hostId=4&type=terminal"),
    ],
    snippets: [
      SnippetEntry(id: 1, name: "Tail syslog", folder: "Ops",
                   preview: "tail -f /var/log/syslog",
                   url: "termix-mobile://widget/snippet?snippetId=1"),
      SnippetEntry(id: 2, name: "Disk usage", folder: "Ops",
                   preview: "df -h --total …",
                   url: "termix-mobile://widget/snippet?snippetId=2"),
      SnippetEntry(id: 3, name: "Restart nginx", folder: "",
                   preview: "sudo systemctl restart nginx",
                   url: "termix-mobile://widget/snippet?snippetId=3"),
    ]
  )

  /// State shown when the user hasn't signed in (or turned widgets off).
  static func signedOut(accent: String = "#f59145") -> WidgetSnapshot {
    WidgetSnapshot(
      version: supportedVersion,
      updatedAt: Date().timeIntervalSince1970 * 1000,
      state: .signedOut,
      accent: accent,
      server: "",
      summary: .zero,
      hosts: [],
      snippets: []
    )
  }
}
