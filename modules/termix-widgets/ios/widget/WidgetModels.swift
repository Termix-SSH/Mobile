import Foundation

/**
 Decoders for the snapshot the app publishes.

 The shape is defined once in `app/widgets/types.ts`; this file mirrors it.
 Every field is decoded defensively: a widget must render *something* even if a
 future app version adds fields or a payload arrives half-written.
 */

/**
 Which tab a host tile opens.

 Mirrors the session types `app/widgets/useWidgetDeepLink.ts` accepts. Anything
 outside this set is rejected by the parser and falls back to a terminal, so the
 two lists must stay in step.
 */
enum SessionKind: String, CaseIterable {
  case terminal
  case stats
  case filemanager

  /// Label used in the picker and the small-family footer.
  var label: String {
    switch self {
    case .terminal: return "TERMINAL"
    case .stats: return "STATS"
    case .filemanager: return "FILES"
    }
  }
}

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

  /**
   The host's deep link retargeted at a different tab.

   The snapshot carries one URL per host (built with `type=terminal`) because it
   is shared by every widget, while the tab is a per-widget choice. Rewriting
   the query here keeps the payload single-purpose and avoids widening the
   contract with one URL per tab type.
   */
  func link(for session: SessionKind) -> URL {
    guard var components = URLComponents(string: url) else { return link }
    var items = (components.queryItems ?? []).filter { $0.name != "type" }
    items.append(URLQueryItem(name: "type", value: session.rawValue))
    components.queryItems = items
    return components.url ?? link
  }

  /// Whether this host reported any load reading.
  var hasMetrics: Bool { cpu != nil || mem != nil }

  /// Shown in place of the bars when no reading has arrived.
  var stateLabel: String {
    switch status {
    case .offline: return "OFFLINE"
    case .online: return "NO DATA"
    case .unknown: return "CHECKING"
    }
  }

  /// Spoken description. The status dot and bars carry no text of their own.
  func accessibilityDescription(opens: SessionKind = .terminal) -> String {
    let state: String
    switch status {
    case .online: state = "online"
    case .offline: state = "offline"
    case .unknown: state = "status unknown"
    }

    var description = "\(name), \(state)"
    if hasMetrics {
      description += ", CPU \(cpu ?? 0) percent, memory \(mem ?? 0) percent"
    }

    let destination: String
    switch opens {
    case .terminal: destination = "a terminal session"
    case .stats: destination = "server stats"
    case .filemanager: destination = "the file manager"
    }
    return description + ". Opens \(destination)."
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

  /**
   Moves the user's chosen host to the front, leaving everything else in order.

   Reordering rather than filtering means the medium and large families still
   fill their remaining rows, and a small widget (which shows only the first
   entry) lands on the chosen host. A selection naming a host that has since
   been deleted falls back to the normal ordering rather than rendering empty.
   */
  func prioritizing(hostId: Int?) -> WidgetSnapshot {
    guard let hostId, hosts.contains(where: { $0.id == hostId }) else { return self }
    let reordered = hosts.filter { $0.id == hostId } + hosts.filter { $0.id != hostId }
    return WidgetSnapshot(
      version: version,
      updatedAt: updatedAt,
      state: state,
      accent: accent,
      server: server,
      summary: summary,
      hosts: reordered,
      snippets: snippets
    )
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
