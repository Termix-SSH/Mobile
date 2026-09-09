import SwiftUI
import WidgetKit

/**
 Shared building blocks. Both widget kinds are assembled from these so the two
 stay visually identical as either evolves.
 */

/// Status dot with a soft halo — reads at a glance without needing a legend.
struct StatusDot: View {
  let status: HostStatus
  var size: CGFloat = 6

  var body: some View {
    let color = Theme.statusColor(status)
    return Circle()
      .fill(color)
      .frame(width: size, height: size)
      .overlay(
        Circle()
          .stroke(color.opacity(0.28), lineWidth: size * 0.55)
      )
  }
}

/// The wordmark + summary line every widget carries.
struct WidgetHeader: View {
  let snapshot: WidgetSnapshot
  let accent: Color
  var showsSummary: Bool = true

  var body: some View {
    HStack(spacing: 6) {
      Rectangle()
        .fill(accent)
        .frame(width: 3, height: 11)

      Text("TERMIX")
        .font(Theme.label(9))
        .tracking(1.4)
        .foregroundColor(Theme.textPrimary)

      Spacer(minLength: 4)

      if showsSummary && snapshot.summary.total > 0 {
        HStack(spacing: 4) {
          StatusDot(status: .online, size: 5)
          Text("\(snapshot.summary.online)/\(snapshot.summary.total)")
            .font(Theme.mono(9, weight: .medium))
            .foregroundColor(Theme.textSecondary)
        }
      }
    }
  }
}

/// Thin usage bar used for CPU / memory.
struct MetricBar: View {
  let label: String
  let percent: Int?
  let accent: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 3) {
        Text(label)
          .font(Theme.label(8))
          .tracking(0.6)
          .foregroundColor(Theme.textTertiary)
        Spacer(minLength: 2)
        Text(percent.map { "\($0)%" } ?? "--")
          .font(Theme.mono(8, weight: .medium))
          .foregroundColor(percent == nil ? Theme.textTertiary : Theme.textSecondary)
      }

      // The track is always drawn, so the row keeps its shape even before a
      // reading arrives. GeometryReader sits inside a fixed-height frame so it
      // has a definite size to measure against.
      Rectangle()
        .fill(Theme.borderStrong.opacity(0.55))
        .frame(height: 3)
        .overlay(alignment: .leading) {
          GeometryReader { geometry in
            if let percent {
              let ratio = CGFloat(min(100, max(0, percent))) / 100
              Rectangle()
                .fill(Theme.loadColor(percent, accent: accent))
                .frame(width: geometry.size.width * ratio)
            }
          }
        }
    }
  }
}

/// Launchable host tile used by the Quick Connect widget.
struct HostTile: View {
  let host: HostEntry
  let accent: Color
  var showsSubtitle: Bool = true
  /// Tab this tile opens. Set per widget in "Edit Widget".
  var opens: SessionKind = .terminal

  var body: some View {
    Link(destination: host.link(for: opens)) {
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 5) {
          StatusDot(status: host.status)
          Text(host.name)
            .font(Theme.mono(11, weight: .semibold))
            .foregroundColor(Theme.textPrimary)
            .lineLimit(1)
            .truncationMode(.tail)
          Spacer(minLength: 0)
          if host.pinned {
            Rectangle()
              .fill(accent.opacity(0.9))
              .frame(width: 3, height: 3)
          }
        }

        if showsSubtitle {
          Text(host.subtitle.isEmpty ? host.folder : host.subtitle)
            .font(Theme.mono(9))
            .foregroundColor(Theme.textTertiary)
            .lineLimit(1)
            .truncationMode(.middle)
        }
      }
      .padding(.horizontal, 7)
      .padding(.vertical, 6)
      .frame(maxWidth: .infinity, alignment: .leading)
      .termixCard(
        fill: host.status == .online ? Theme.cardRaised : Theme.card,
        border: host.status == .online ? accent.opacity(0.30) : Theme.border
      )
    }
    .widgetLinkReset()
    .unredacted()
    .accessibilityLabel(host.accessibilityDescription(opens: opens))
  }
}

/// Metric row used by the Server Status widget.
struct HostMetricRow: View {
  let host: HostEntry
  let accent: Color
  var showsSubtitle: Bool = true
  /// Tab this row opens. Defaults to the server stats tab, since that is what
  /// the row is showing.
  var opens: SessionKind = .stats
  /**
   Puts the bars beside the name instead of under it, halving the row height.

   Two stacked rows plus a header and footer overflow a medium widget, which
   collapses the spacer and presses the header and footer against the edges.
   The large family has the height for the taller form, so it keeps it.
   */
  var compact: Bool = false

  var body: some View {
    Link(destination: host.link(for: opens)) {
      content
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .termixCard()
    }
    .widgetLinkReset()
    .unredacted()
    .accessibilityLabel(host.accessibilityDescription(opens: opens))
  }

  @ViewBuilder private var content: some View {
    if compact {
      HStack(spacing: 8) {
        StatusDot(status: host.status)
        Text(host.name)
          .font(Theme.mono(11, weight: .semibold))
          .foregroundColor(Theme.textPrimary)
          .lineLimit(1)
          .truncationMode(.tail)
        Spacer(minLength: 4)
        if host.hasMetrics {
          MetricBar(label: "CPU", percent: host.cpu, accent: accent)
            .frame(width: 46)
          MetricBar(label: "MEM", percent: host.mem, accent: accent)
            .frame(width: 46)
        } else {
          Text(host.stateLabel)
            .font(Theme.label(8))
            .tracking(0.8)
            .foregroundColor(Theme.textTertiary)
        }
      }
    } else {
      VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 5) {
          StatusDot(status: host.status)
          Text(host.name)
            .font(Theme.mono(11, weight: .semibold))
            .foregroundColor(Theme.textPrimary)
            .lineLimit(1)
          Spacer(minLength: 4)
          if showsSubtitle && !host.subtitle.isEmpty {
            Text(host.subtitle)
              .font(Theme.mono(8))
              .foregroundColor(Theme.textTertiary)
              .lineLimit(1)
              .truncationMode(.middle)
          }
        }

        // Load and reachability are collected separately, so show the bars
        // whenever a reading exists rather than gating them on the status.
        if host.hasMetrics {
          HStack(spacing: 10) {
            MetricBar(label: "CPU", percent: host.cpu, accent: accent)
            MetricBar(label: "MEM", percent: host.mem, accent: accent)
          }
        } else {
          Text(host.stateLabel)
            .font(Theme.label(8))
            .tracking(0.8)
            .foregroundColor(Theme.textTertiary)
        }
      }
    }
  }
}

/// Shown for the signed-out / no-hosts states.
struct EmptyStateView: View {
  let snapshot: WidgetSnapshot
  let accent: Color
  var compact: Bool = false
  /// What the widget would have listed — drives the "nothing here yet" copy.
  var subject: String = "hosts"

  /// Hosts exist but none passed the widget filters, so "no hosts yet" would
  /// be wrong here.
  private var filteredOut: Bool {
    snapshot.state != .signedOut && snapshot.summary.total > 0
  }

  private var title: String {
    if snapshot.state == .signedOut { return "Not signed in" }
    return filteredOut ? "Nothing to show" : "No \(subject) yet"
  }

  private var message: String {
    if snapshot.state == .signedOut {
      return "Open Termix to sign in."
    }
    if filteredOut {
      return "Your filters hide every \(subject.dropLast()). Change them in Settings."
    }
    return "Add a \(subject.dropLast()) in Termix to see it here."
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      WidgetHeader(snapshot: snapshot, accent: accent, showsSummary: false)
      Spacer(minLength: 0)
      Text(title)
        .font(Theme.mono(compact ? 12 : 13, weight: .semibold))
        .foregroundColor(Theme.textPrimary)
      if !compact {
        Text(message)
          .font(Theme.mono(9))
          .foregroundColor(Theme.textTertiary)
          .lineLimit(3)
          .minimumScaleFactor(0.9)
      }
      Spacer(minLength: 0)
      Text("OPEN TERMIX")
        .font(Theme.label(8))
        .tracking(1)
        .foregroundColor(accent)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(WidgetSnapshot.fallbackLink)
  }
}

/// Snippet tile — tapping runs the command on a host chosen in the app.
struct SnippetTile: View {
  let snippet: SnippetEntry
  let accent: Color
  var showsPreview: Bool = true

  var body: some View {
    Link(destination: snippet.link) {
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 5) {
          // A caret keeps the "this is a command" metaphor without an icon set.
          Text(">")
            .font(Theme.mono(10, weight: .bold))
            .foregroundColor(accent)
          Text(snippet.name)
            .font(Theme.mono(11, weight: .semibold))
            .foregroundColor(Theme.textPrimary)
            .lineLimit(1)
            .truncationMode(.tail)
          Spacer(minLength: 0)
        }

        if showsPreview && !snippet.preview.isEmpty {
          Text(snippet.preview)
            .font(Theme.mono(9))
            .foregroundColor(Theme.textTertiary)
            .lineLimit(1)
            .truncationMode(.tail)
        }
      }
      .padding(.horizontal, 7)
      .padding(.vertical, 6)
      .frame(maxWidth: .infinity, alignment: .leading)
      .termixCard()
    }
    .widgetLinkReset()
    .unredacted()
    .accessibilityLabel("\(snippet.name). Runs this snippet on a host you pick.")
  }
}

/// Footer line: how old the data is. The server address is deliberately not
/// shown, it tells the user nothing they don't already know and puts an
/// internal hostname on the home screen.
struct WidgetFooter: View {
  let snapshot: WidgetSnapshot

  var body: some View {
    HStack(spacing: 4) {
      Spacer(minLength: 0)
      Text(relativeAge(from: snapshot.updatedDate))
        .font(Theme.mono(8))
        .foregroundColor(Theme.textTertiary)
    }
  }
}
