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

    static var defaultQuery = HostOptionQuery()

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
  }

  @available(iOSApplicationExtension 17.0, *)
  struct HostOptionQuery: EntityQuery {
    /// Every host in the current snapshot, in the order the widgets rank them.
    private var hosts: [HostEntry] { SharedStore.loadSnapshot().hosts }

    func entities(for identifiers: [Int]) async throws -> [HostOption] {
      // Preserve the caller's order: this is what renders an existing choice.
      identifiers.compactMap { id in
        hosts.first { $0.id == id }.map(HostOption.init(entry:))
      }
    }

    func suggestedEntities() async throws -> [HostOption] {
      hosts.map(HostOption.init(entry:))
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
    static var description = IntentDescription(
      "Choose which server this widget shows. Leave it empty to follow your pinned and online hosts."
    )

    @Parameter(title: "Host")
    var host: HostOption?

    init() {}

    init(host: HostOption?) {
      self.host = host
    }
  }
#endif
