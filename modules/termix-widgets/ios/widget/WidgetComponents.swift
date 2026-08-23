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

      GeometryReader { geometry in
        ZStack(alignment: .leading) {
          Rectangle()
            .fill(Theme.borderStrong.opacity(0.55))
          if let percent {
            Rectangle()
              .fill(Theme.loadColor(percent, accent: accent))
              .frame(width: max(2, geometry.size.width * CGFloat(percent) / 100))
          }
        }
      }
      .frame(height: 3)
    }
  }
}

/// Launchable host tile used by the Quick Connect widget.
struct HostTile: View {
  let host: HostEntry
  let accent: Color
  var showsSubtitle: Bool = true

  var body: some View {
    Link(destination: host.link) {
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
    .accessibilityLabel(host.accessibilityDescription)
  }
}

/// Metric row used by the Server Status widget.
struct HostMetricRow: View {
  let host: HostEntry
  let accent: Color
  var showsSubtitle: Bool = true

  var body: some View {
    Link(destination: host.link) {
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

        if host.status == .online {
          HStack(spacing: 10) {
            MetricBar(label: "CPU", percent: host.cpu, accent: accent)
            MetricBar(label: "MEM", percent: host.mem, accent: accent)
          }
        } else {
          Text(host.status == .offline ? "OFFLINE" : "STATUS UNKNOWN")
            .font(Theme.label(8))
            .tracking(0.8)
            .foregroundColor(Theme.textTertiary)
        }
      }
      .padding(.horizontal, 8)
      .padding(.vertical, 7)
      .frame(maxWidth: .infinity, alignment: .leading)
      .termixCard()
    }
    .accessibilityLabel(host.accessibilityDescription)
  }
}

/// Shown for the signed-out / no-hosts states.
struct EmptyStateView: View {
  let snapshot: WidgetSnapshot
  let accent: Color
  var compact: Bool = false
  /// What the widget would have listed — drives the "nothing here yet" copy.
  var subject: String = "hosts"

  /// True when the account has hosts but the widget's filters excluded them —
  /// "no hosts yet" would be a lie in that case.
  private var filteredOut: Bool {
    snapshot.state != .signedOut && snapshot.summary.total > 0
  }

  private var title: String {
    if snapshot.state == .signedOut { return "Not signed in" }
    return filteredOut ? "Nothing to show" : "No \(subject) yet"
  }

  private var message: String {
    if snapshot.state == .signedOut {
      return "Open Termix to connect to your server."
    }
    if filteredOut {
      return "Widget filters hide every \(subject.dropLast()). Change them in Settings → Widgets."
    }
    return "Add a \(subject.dropLast()) in Termix, or enable them in Settings → Widgets."
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
      HStack(spacing: 4) {
        Rectangle().fill(accent).frame(width: 6, height: 1)
        Text("OPEN TERMIX")
          .font(Theme.label(8))
          .tracking(1)
          .foregroundColor(accent)
      }
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
    .accessibilityLabel("\(snippet.name). Runs this snippet on a host you pick.")
  }
}

/// Footer line: server label on the left, data freshness on the right.
struct WidgetFooter: View {
  let snapshot: WidgetSnapshot

  var body: some View {
    HStack(spacing: 4) {
      if !snapshot.server.isEmpty {
        Text(snapshot.server)
          .font(Theme.mono(8))
          .foregroundColor(Theme.textTertiary)
          .lineLimit(1)
          .truncationMode(.middle)
      }
      Spacer(minLength: 4)
      Text(relativeAge(from: snapshot.updatedDate))
        .font(Theme.mono(8))
        .foregroundColor(Theme.textTertiary)
    }
  }
}
