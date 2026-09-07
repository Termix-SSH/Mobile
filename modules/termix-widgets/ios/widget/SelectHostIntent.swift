import WidgetKit

#if canImport(AppIntents)
  import AppIntents

  /**
   Host picker shown in "Edit Widget".

   The options come from the snapshot the app already publishes, so the picker
   needs no network access and no separate query path. Leaving the selection
   empty keeps the automatic behaviour: pinned first, then online, then by name.
   */
  @available(iOSApplicationExtension 17.0, *)
  struct HostOption: AppEntity {
    let id: Int
    let name: String
    let subtitle: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
      TypeDisplayRepresentation(name: "Host")
    }

    static var defaultQuery: HostOptionQuery { HostOptionQuery() }

    var displayRepresentation: DisplayRepresentation {
      // The subtitle is user@ip, which is what tells two similarly named hosts
      // apart. It is omitted when the user turned addresses off.
      if subtitle.isEmpty {
        return DisplayRepresentation(title: "\(name)")
      }
      return DisplayRepresentation(title: "\(name)", subtitle: "\(subtitle)")
    }

    init(id: Int, name: String, subtitle: String) {
      self.id = id
      self.name = name
      self.subtitle = subtitle
    }

    init(entry: HostEntry) {
      self.init(id: entry.id, name: entry.name, subtitle: entry.subtitle)
    }

    /// Placeholder row shown when there is nothing to choose from. Host ids are
    /// positive, so this can never collide with a real one.
    static let unavailable = HostOption(
      id: -1,
      name: "No hosts available",
      subtitle: "Open Termix and sign in"
    )
  }

  /**
   `EntityStringQuery`, not a bare `EntityQuery`: the picker renders a
   searchable list, and the string variant is the surface the system expects for
   a configuration parameter. A bare `EntityQuery` leaves the search field dead.
   */
  @available(iOSApplicationExtension 17.0, *)
  struct HostOptionQuery: EntityStringQuery {
    /// Every host in the current snapshot, in the order the widgets rank them.
    private var hosts: [HostEntry] { SharedStore.loadSnapshot().hosts }

    func entities(for identifiers: [Int]) async throws -> [HostOption] {
      // Preserve the caller's order: this is what renders an existing choice.
      identifiers.compactMap { id in
        hosts.first { $0.id == id }.map(HostOption.init(entry:))
      }
    }

    /// Backs the picker's search field. Matches the address too, since that is
    /// what tells two similarly named hosts apart.
    func entities(matching string: String) async throws -> [HostOption] {
      let needle = string.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !needle.isEmpty else { return try await suggestedEntities() }
      return hosts
        .filter {
          $0.name.localizedCaseInsensitiveContains(needle)
            || $0.subtitle.localizedCaseInsensitiveContains(needle)
        }
        .map(HostOption.init(entry:))
    }

    /**
     The list the picker opens on.

     An empty snapshot (signed out, widgets turned off, or every host filtered
     out by the widget preferences) would otherwise vend an empty sheet, which
     reads as a hang rather than as a state to fix. One explanatory row says
     what to do instead. It carries a sentinel id that never matches a real
     host, so picking it resolves to nothing and the widget keeps its automatic
     ordering.
     */
    func suggestedEntities() async throws -> [HostOption] {
      guard !hosts.isEmpty else { return [HostOption.unavailable] }
      return hosts.map(HostOption.init(entry:))
    }
  }

  /**
   Configuration attached to a placed widget.

   `host` is optional on purpose. A widget added before this shipped, or one the
   user never edited, carries no selection and keeps the automatic ordering
   rather than silently locking onto some arbitrary host.
   */
  @available(iOSApplicationExtension 17.0, *)
  struct SelectHostIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Select Host"
    static var description: IntentDescription {
      IntentDescription("Choose which server this widget shows, and which tab it opens.")
    }

    @Parameter(title: "Host")
    var host: HostOption?

    /// Which tab a tap opens. Defaults to the terminal, matching how the
    /// widgets behaved before this was configurable.
    @Parameter(title: "Opens", default: .terminal)
    var opens: SessionKindOption

    init() {}

    init(host: HostOption?, opens: SessionKindOption = .terminal) {
      self.host = host
      self.opens = opens
    }

    /// Resolved tab choice, as the plain enum the views and links use.
    var sessionKind: SessionKind { opens.kind }
  }

  /// `SessionKind` as an AppEnum so it can appear in the widget's editor.
  @available(iOSApplicationExtension 17.0, *)
  enum SessionKindOption: String, AppEnum {
    case terminal
    case stats
    case filemanager

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
      TypeDisplayRepresentation(name: "Tab")
    }

    static var caseDisplayRepresentations: [SessionKindOption: DisplayRepresentation] {
      [
        .terminal: DisplayRepresentation(title: "Terminal"),
        .stats: DisplayRepresentation(title: "Server stats"),
        .filemanager: DisplayRepresentation(title: "Files"),
      ]
    }

    var kind: SessionKind { SessionKind(rawValue: rawValue) ?? .terminal }
  }
#endif
