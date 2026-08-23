import WidgetKit
import SwiftUI

/**
 Quick Connect — a launcher for your hosts.

 Small shows the single most relevant host (pinned first, then online), medium a
 2×2 grid, large a 2×4 grid with a summary strip. Every tile deep-links straight
 into a terminal session for that host.
 */
struct QuickConnectWidget: Widget {
  static let kind = "TermixQuickConnectWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: TermixProvider()) { entry in
      QuickConnectView(entry: entry)
    }
    .configurationDisplayName("Quick Connect")
    .description("Jump straight into a terminal session on your servers.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct QuickConnectView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TermixEntry

  private var snapshot: WidgetSnapshot { entry.snapshot }
  private var accent: Color { Theme.accent(snapshot.accent) }

  /// Tiles each family can show without cramping.
  private var capacity: Int {
    switch family {
    case .systemSmall: return 1
    case .systemMedium: return 4
    default: return 8
    }
  }

  var body: some View {
    Group {
      if snapshot.hosts.isEmpty {
        EmptyStateView(snapshot: snapshot, accent: accent, compact: family == .systemSmall)
      } else {
        switch family {
        case .systemSmall: smallLayout
        case .systemMedium: gridLayout(columns: 2)
        default: largeLayout
        }
      }
    }
    .padding(family == .systemSmall ? 10 : 12)
    .widgetBackground()
  }

  // MARK: - Layouts

  private var featured: HostEntry? { snapshot.hosts.first }

  private var smallLayout: some View {
    VStack(alignment: .leading, spacing: 0) {
      WidgetHeader(snapshot: snapshot, accent: accent)

      Spacer(minLength: 6)

      if let host = featured {
        VStack(alignment: .leading, spacing: 5) {
          HStack(spacing: 5) {
            StatusDot(status: host.status, size: 7)
            Text(host.name)
              .font(Theme.mono(14, weight: .bold))
              .foregroundColor(Theme.textPrimary)
              .lineLimit(1)
              .minimumScaleFactor(0.75)
          }

          if !host.subtitle.isEmpty {
            Text(host.subtitle)
              .font(Theme.mono(9))
              .foregroundColor(Theme.textTertiary)
              .lineLimit(1)
              .truncationMode(.middle)
          }

          if host.status == .online && (host.cpu != nil || host.mem != nil) {
            HStack(spacing: 10) {
              MetricBar(label: "CPU", percent: host.cpu, accent: accent)
              MetricBar(label: "MEM", percent: host.mem, accent: accent)
            }
            .padding(.top, 1)
          }
        }
      }

      Spacer(minLength: 6)

      HStack(spacing: 4) {
        Rectangle().fill(accent).frame(width: 6, height: 1)
        Text("CONNECT")
          .font(Theme.label(8))
          .tracking(1.2)
          .foregroundColor(accent)
        Spacer(minLength: 2)
        Text(relativeAge(from: snapshot.updatedDate))
          .font(Theme.mono(8))
          .foregroundColor(Theme.textTertiary)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(featured?.link ?? WidgetSnapshot.fallbackLink)
  }

  private func gridLayout(columns: Int) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      WidgetHeader(snapshot: snapshot, accent: accent)
      tileGrid(columns: columns)
      Spacer(minLength: 0)
      WidgetFooter(snapshot: snapshot)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private var largeLayout: some View {
    VStack(alignment: .leading, spacing: 8) {
      WidgetHeader(snapshot: snapshot, accent: accent)
      SummaryStrip(summary: snapshot.summary, accent: accent)
      tileGrid(columns: 2)
      Spacer(minLength: 0)
      WidgetFooter(snapshot: snapshot)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private func tileGrid(columns: Int) -> some View {
    let visible = Array(snapshot.hosts.prefix(capacity))
    return VStack(spacing: 6) {
      ForEach(Array(chunked(visible, into: columns).enumerated()), id: \.offset) { _, row in
        HStack(spacing: 6) {
          ForEach(row) { host in
            HostTile(host: host, accent: accent)
          }
          // Keep the last row aligned with the ones above it.
          if row.count < columns {
            ForEach(0..<(columns - row.count), id: \.self) { _ in
              Color.clear.frame(maxWidth: .infinity)
            }
          }
        }
      }
    }
  }
}

/// online / offline / total counters shown on the large family.
struct SummaryStrip: View {
  let summary: HostSummary
  let accent: Color

  var body: some View {
    HStack(spacing: 0) {
      counter(value: summary.online, label: "ONLINE", color: Theme.online)
      divider
      counter(value: summary.offline, label: "OFFLINE", color: Theme.offline)
      divider
      counter(value: summary.total, label: "HOSTS", color: accent)
    }
    .padding(.vertical, 6)
    .termixCard(fill: Theme.surface)
  }

  private var divider: some View {
    Rectangle()
      .fill(Theme.border)
      .frame(width: 1, height: 20)
  }

  private func counter(value: Int, label: String, color: Color) -> some View {
    VStack(spacing: 1) {
      Text("\(value)")
        .font(Theme.mono(14, weight: .bold))
        .foregroundColor(color)
      Text(label)
        .font(Theme.label(8))
        .tracking(0.9)
        .foregroundColor(Theme.textTertiary)
    }
    .frame(maxWidth: .infinity)
  }
}
