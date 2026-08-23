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

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: TermixProvider()) { entry in
      StatusView(entry: entry)
    }
    .configurationDisplayName("Server Status")
    .description("CPU and memory load for the servers you care about.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct StatusView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TermixEntry

  private var snapshot: WidgetSnapshot { entry.snapshot }
  private var accent: Color { Theme.accent(snapshot.accent) }

  private var rowCount: Int {
    switch family {
    case .systemSmall: return 1
    case .systemMedium: return 3
    default: return 6
    }
  }

  /// Online hosts carry metrics; fall back to everything so the widget is never
  /// blank just because nothing is reporting yet.
  private var rankedHosts: [HostEntry] {
    let online = snapshot.hosts.filter { $0.status == .online }
    let source = online.isEmpty ? snapshot.hosts : online
    return Array(source.prefix(rowCount))
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

          if host.status == .online {
            VStack(spacing: 7) {
              MetricBar(label: "CPU", percent: host.cpu, accent: accent)
              MetricBar(label: "MEM", percent: host.mem, accent: accent)
            }
          } else {
            Text(host.status == .offline ? "OFFLINE" : "STATUS UNKNOWN")
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

      VStack(spacing: 6) {
        ForEach(rankedHosts) { host in
          HostMetricRow(host: host, accent: accent, showsSubtitle: family != .systemMedium)
        }
      }

      Spacer(minLength: 0)
      WidgetFooter(snapshot: snapshot)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}
