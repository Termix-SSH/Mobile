import WidgetKit
import SwiftUI

/**
 Server Status — CPU and memory at a glance.

 Reads the same snapshot as Quick Connect but leads with load rather than
 launching: small focuses on one host, medium and large list several. Rows are
 still tappable, so it doubles as a launcher.
 */
struct StatusWidget: Widget {
  static let kind = "TermixStatusWidget"

  // `some WidgetConfiguration` is a single concrete type, so the two
  // configurations cannot be branched inside one `body`. Availability is
  // resolved by picking a whole widget in the bundle instead.
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: TermixProvider()) { entry in
      StatusView(entry: entry)
    }
    .configurationDisplayName("Server Status")
    .description("CPU and memory for your servers.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

#if canImport(AppIntents)
  /// iOS 17+ variant: same view, plus a host picker under "Edit Widget".
  @available(iOSApplicationExtension 17.0, *)
  struct ConfigurableStatusWidget: Widget {
    var body: some WidgetConfiguration {
      AppIntentConfiguration(
        kind: StatusWidget.kind,
        intent: SelectHostIntent.self,
        provider: TermixConfigurableProvider()
      ) { entry in
        StatusView(entry: entry, hasExplicitHost: entry.hasExplicitHost)
      }
      .configurationDisplayName("Server Status")
      .description("CPU and memory for your servers.")
      .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
  }
#endif

struct StatusView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TermixEntry
  /// True when the user picked a host in "Edit Widget". Their choice then wins
  /// over the metrics-first ranking below.
  var hasExplicitHost: Bool = false

  private var snapshot: WidgetSnapshot { entry.snapshot }
  private var accent: Color { Theme.accent(snapshot.accent) }

  // A metric row is tall (name plus two bars), so a medium widget fits two.
  // Three overflowed the container, which the widget gallery renders as content
  // running off the preview.
  private var rowCount: Int {
    switch family {
    case .systemSmall: return 1
    case .systemMedium: return 2
    default: return 5
    }
  }

  /// Hosts that report load come first; the rest stay below them so the list
  /// matches what the app shows. A host the user picked is already at the front
  /// of the snapshot and must stay there, so the ranking is skipped entirely.
  private var rankedHosts: [HostEntry] {
    guard !hasExplicitHost else { return Array(snapshot.hosts.prefix(rowCount)) }
    // A stable partition, not a sort: Swift's sort is not guaranteed stable and
    // would let rows reshuffle between refreshes.
    let ranked = snapshot.hosts.filter(\.hasMetrics)
      + snapshot.hosts.filter { !$0.hasMetrics }
    return Array(ranked.prefix(rowCount))
  }

  var body: some View {
    Group {
      if snapshot.hosts.isEmpty {
        EmptyStateView(snapshot: snapshot, accent: accent, compact: family == .systemSmall)
      } else if family == .systemSmall {
        smallLayout
      } else {
        listLayout
      }
    }
    .padding(family == .systemSmall ? 10 : 12)
    .widgetBackground()
  }

  // MARK: - Layouts

  private var smallLayout: some View {
    let host = rankedHosts.first
    return VStack(alignment: .leading, spacing: 0) {
      WidgetHeader(snapshot: snapshot, accent: accent)

      Spacer(minLength: 6)

      if let host {
        VStack(alignment: .leading, spacing: 8) {
          HStack(spacing: 5) {
            StatusDot(status: host.status, size: 7)
            Text(host.name)
              .font(Theme.mono(13, weight: .bold))
              .foregroundColor(Theme.textPrimary)
              .lineLimit(1)
              .minimumScaleFactor(0.75)
          }

          if host.hasMetrics {
            VStack(spacing: 7) {
              MetricBar(label: "CPU", percent: host.cpu, accent: accent)
              MetricBar(label: "MEM", percent: host.mem, accent: accent)
            }
          } else {
            Text(host.stateLabel)
              .font(Theme.label(9))
              .tracking(0.9)
              .foregroundColor(Theme.textTertiary)
          }
        }
      }

      Spacer(minLength: 6)

      WidgetFooter(snapshot: snapshot)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(host?.link ?? WidgetSnapshot.fallbackLink)
  }

  private var listLayout: some View {
    VStack(alignment: .leading, spacing: 8) {
      WidgetHeader(snapshot: snapshot, accent: accent)

      // fixedSize stops a row from being compressed below its natural height,
      // and the clipped container guarantees nothing escapes the widget even if
      // the user runs a large Dynamic Type size.
      VStack(spacing: 6) {
        ForEach(rankedHosts) { host in
          HostMetricRow(host: host, accent: accent, showsSubtitle: family != .systemMedium)
        }
      }
      .frame(maxWidth: .infinity, alignment: .top)
      .clipped()

      Spacer(minLength: 0)
      WidgetFooter(snapshot: snapshot)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}
