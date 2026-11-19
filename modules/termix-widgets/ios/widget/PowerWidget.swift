import SwiftUI
import WidgetKit

#if canImport(AppIntents)
  import AppIntents

  /**
   Power: one Wake-on-LAN device with its name and status. A tap wakes it when
   it is off and shuts it down when it is on, without opening the app.

   Needs iOS 17 for buttons that run in the widget.
   */
  @available(iOSApplicationExtension 17.0, *)
  struct PowerWidget: Widget {
    static let kind = "TermixPowerWidget"

    var body: some WidgetConfiguration {
      AppIntentConfiguration(
        kind: Self.kind,
        intent: SelectPowerDeviceIntent.self,
        provider: PowerProvider()
      ) { entry in
        PowerView(entry: entry)
      }
      .configurationDisplayName("Power")
      .description("Wake or shut down a machine with one tap.")
      .supportedFamilies([.systemSmall])
      .termixEssentialBackground()
    }
  }

  // MARK: - Configuration

  @available(iOSApplicationExtension 17.0, *)
  struct PowerDeviceOption: AppEntity {
    let id: String
    let name: String
    let subtitle: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
      TypeDisplayRepresentation(name: "Machine")
    }

    static var defaultQuery: PowerDeviceQuery { PowerDeviceQuery() }

    var displayRepresentation: DisplayRepresentation {
      subtitle.isEmpty
        ? DisplayRepresentation(title: "\(name)")
        : DisplayRepresentation(title: "\(name)", subtitle: "\(subtitle)")
    }

    init(device: PowerDevice) {
      id = device.key
      name = device.name
      subtitle = [device.address, device.server].filter { !$0.isEmpty }.joined(separator: " | ")
    }

    init(id: String, name: String, subtitle: String) {
      self.id = id
      self.name = name
      self.subtitle = subtitle
    }
  }

  @available(iOSApplicationExtension 17.0, *)
  struct PowerDeviceQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [PowerDeviceOption] {
      let devices = PowerStore.devices()
      return identifiers.compactMap { id in
        devices.first { $0.key == id }.map(PowerDeviceOption.init(device:))
      }
    }

    func entities(matching string: String) async throws -> [PowerDeviceOption] {
      let needle = string.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !needle.isEmpty else { return try await suggestedEntities() }
      return PowerStore.devices()
        .filter {
          $0.name.localizedCaseInsensitiveContains(needle)
            || $0.address.localizedCaseInsensitiveContains(needle)
        }
        .map(PowerDeviceOption.init(device:))
    }

    func suggestedEntities() async throws -> [PowerDeviceOption] {
      let devices = PowerStore.devices()
      guard !devices.isEmpty else {
        return [
          PowerDeviceOption(
            id: "",
            name: "No machines yet",
            subtitle: "Turn on Power for a host, then open Termix"
          ),
        ]
      }
      return devices.map(PowerDeviceOption.init(device:))
    }
  }

  @available(iOSApplicationExtension 17.0, *)
  struct SelectPowerDeviceIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Select Machine"
    static var description: IntentDescription {
      IntentDescription("Choose which machine this widget wakes and shuts down.")
    }

    @Parameter(title: "Machine")
    var device: PowerDeviceOption?

    init() {}
  }

  /// Runs in the widget when it is tapped.
  @available(iOSApplicationExtension 17.0, *)
  struct TogglePowerIntent: AppIntent {
    static var title: LocalizedStringResource = "Wake or Shut Down"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Machine")
    var deviceKey: String

    init() {}

    init(deviceKey: String) {
      self.deviceKey = deviceKey
    }

    func perform() async throws -> some IntentResult {
      await PowerStore.toggle(key: deviceKey)
      return .result()
    }
  }

  // MARK: - Timeline

  struct PowerEntry: TimelineEntry {
    let date: Date
    let device: PowerDevice?
    let status: PowerStatus
    let armed: Bool
    let notice: String?
    let snapshot: WidgetSnapshot
  }

  @available(iOSApplicationExtension 17.0, *)
  struct PowerProvider: AppIntentTimelineProvider {
    private static let idleRefresh: TimeInterval = 5 * 60
    private static let movingRefresh: TimeInterval = 15

    func placeholder(in context: Context) -> PowerEntry {
      PowerEntry(
        date: Date(), device: .placeholder, status: .offline, armed: false,
        notice: nil, snapshot: .placeholder
      )
    }

    func snapshot(for configuration: SelectPowerDeviceIntent, in context: Context) async -> PowerEntry {
      if context.isPreview { return placeholder(in: context) }
      return entry(for: PowerStore.device(key: configuration.device?.id))
    }

    func timeline(for configuration: SelectPowerDeviceIntent, in context: Context) async
      -> Timeline<PowerEntry>
    {
      let current = entry(for: PowerStore.device(key: configuration.device?.id))
      guard let device = current.device else {
        return Timeline(entries: [current], policy: .after(Date().addingTimeInterval(Self.idleRefresh)))
      }

      if let live = await PowerStore.fetchStatus(device) {
        var local = PowerStore.loadLocal()
        local.live[device.key] = .init(status: live, at: Date().timeIntervalSince1970)
        PowerStore.saveLocal(local)
      }
      let fresh = entry(for: device)
      let now = Date()
      var entries = [fresh]
      var next = now.addingTimeInterval(fresh.status.isMoving ? Self.movingRefresh : Self.idleRefresh)

      // Drop the "tap again" or error line once it runs out.
      let local = PowerStore.loadLocal()
      let ends = [local.armed[device.key], local.notices[device.key]?.until]
        .compactMap { $0 }
        .map { Date(timeIntervalSince1970: $0) }
        .filter { $0 > now }
      if let end = ends.min() {
        entries.append(entry(for: device, at: end.addingTimeInterval(0.5)))
        next = min(next, end.addingTimeInterval(Self.movingRefresh))
      }
      return Timeline(entries: entries, policy: .after(next))
    }

    private func entry(for device: PowerDevice?, at date: Date = Date()) -> PowerEntry {
      let snapshot = SharedStore.loadSnapshot()
      guard let device else {
        return PowerEntry(
          date: date, device: nil, status: .unknown, armed: false, notice: nil, snapshot: snapshot
        )
      }
      let local = PowerStore.loadLocal()
      let stamp = date.timeIntervalSince1970
      let notice = local.notices[device.key].flatMap { $0.until > stamp ? $0.text : nil }
      return PowerEntry(
        date: date,
        device: device,
        status: PowerStore.status(of: device, local: local, now: date),
        armed: (local.armed[device.key] ?? 0) > stamp,
        notice: notice,
        snapshot: snapshot
      )
    }
  }

  // MARK: - View

  @available(iOSApplicationExtension 17.0, *)
  struct PowerView: View {
    let entry: PowerEntry

    private var accent: Color { Theme.accent(entry.snapshot.accent) }

    private var statusColor: Color {
      switch entry.status {
      case .online: return Theme.online
      case .offline, .failed: return Theme.offline
      case .waking, .stopping: return accent
      case .unknown: return Theme.unknown
      }
    }

    private var hint: String {
      if let notice = entry.notice { return notice }
      if entry.armed { return "Tap again to shut down" }
      guard let device = entry.device else { return "" }
      switch entry.status {
      case .online: return device.canShutdown ? "Tap to shut down" : ""
      case .waking: return "Waking up"
      case .stopping: return "Shutting down"
      default: return device.canWake ? "Tap to wake" : ""
      }
    }

    var body: some View {
      Group {
        if let device = entry.device {
          Button(intent: TogglePowerIntent(deviceKey: device.key)) {
            content(device)
          }
          .buttonStyle(.plain)
        } else {
          empty
        }
      }
      .widgetBackground()
      .unredacted()
    }

    private func content(_ device: PowerDevice) -> some View {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 6) {
          Rectangle().fill(accent).frame(width: 3, height: 11)
          Text("POWER")
            .font(Theme.label(9))
            .tracking(1.4)
            .foregroundColor(Theme.textPrimary)
          Spacer(minLength: 4)
          Image(systemName: "power")
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(entry.armed ? Theme.offline : statusColor)
        }

        Spacer(minLength: 6)

        Text(device.name)
          .font(Theme.mono(15, weight: .bold))
          .foregroundColor(Theme.textPrimary)
          .lineLimit(2)
          .minimumScaleFactor(0.7)

        if !device.address.isEmpty {
          Text(device.address)
            .font(Theme.mono(10))
            .foregroundColor(Theme.textTertiary)
            .lineLimit(1)
            .padding(.top, 2)
        }

        HStack(spacing: 5) {
          Circle().fill(statusColor).frame(width: 7, height: 7)
          Text(entry.status.label)
            .font(Theme.label(10))
            .tracking(0.9)
            .foregroundColor(statusColor)
            .lineLimit(1)
        }
        .padding(.top, 8)

        Spacer(minLength: 4)

        Text(hint)
          .font(Theme.mono(9, weight: .medium))
          .foregroundColor(entry.armed || entry.notice != nil ? Theme.offline : Theme.textSecondary)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .contentShape(Rectangle())
      .accessibilityElement(children: .combine)
      .accessibilityLabel("\(device.name), \(entry.status.label.lowercased()). \(hint)")
    }

    private var empty: some View {
      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 6) {
          Rectangle().fill(accent).frame(width: 3, height: 11)
          Text("POWER")
            .font(Theme.label(9))
            .tracking(1.4)
            .foregroundColor(Theme.textPrimary)
        }
        Spacer(minLength: 4)
        Text("No machine")
          .font(Theme.mono(13, weight: .bold))
          .foregroundColor(Theme.textPrimary)
        Text("Turn on Power for a host, open Termix, then edit this widget.")
          .font(Theme.mono(9))
          .foregroundColor(Theme.textTertiary)
          .lineLimit(4)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .widgetURL(WidgetSnapshot.fallbackLink)
    }
  }
#endif
