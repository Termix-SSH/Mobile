import WidgetKit
import SwiftUI

/**
 Snippets — the commands you keep reaching for, one tap from the home screen.

 Tapping a snippet copies it to the clipboard and opens the snippets list in the
 app. Only the snippet id travels in the deep link; the command text is read
 inside the authenticated app.
 */
struct SnippetsWidget: Widget {
  static let kind = "TermixSnippetsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: TermixProvider()) { entry in
      SnippetsView(entry: entry)
    }
    .configurationDisplayName("Snippets")
    .description("Copy a saved command straight from your home screen.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct SnippetsView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TermixEntry

  private var snapshot: WidgetSnapshot { entry.snapshot }
  private var accent: Color { Theme.accent(snapshot.accent) }

  private var capacity: Int {
    switch family {
    case .systemSmall: return 3
    case .systemMedium: return 4
    default: return 8
    }
  }

  private var visible: [SnippetEntry] {
    Array(snapshot.snippets.prefix(capacity))
  }

  var body: some View {
    Group {
      if snapshot.snippets.isEmpty {
        EmptyStateView(
          snapshot: snapshot,
          accent: accent,
          compact: family == .systemSmall,
          subject: "snippets"
        )
      } else {
        VStack(alignment: .leading, spacing: 8) {
          header
          list
          Spacer(minLength: 0)
          if family != .systemSmall {
            WidgetFooter(snapshot: snapshot)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        // `Link` is inert on the small family, so the whole widget opens the
        // snippets list there instead of silently doing nothing.
        .widgetURL(family == .systemSmall ? WidgetSnapshot.snippetsLink : nil)
      }
    }
    .padding(family == .systemSmall ? 10 : 12)
    .widgetBackground()
  }

  private var header: some View {
    HStack(spacing: 6) {
      Rectangle()
        .fill(accent)
        .frame(width: 3, height: 11)

      Text("SNIPPETS")
        .font(Theme.label(9))
        .tracking(1.4)
        .foregroundColor(Theme.textPrimary)

      Spacer(minLength: 4)

      Text("\(snapshot.snippets.count)")
        .font(Theme.mono(9, weight: .medium))
        .foregroundColor(Theme.textSecondary)
    }
  }

  private var list: some View {
    // One column reads better than a grid: commands are wide, names are short.
    VStack(spacing: 6) {
      ForEach(visible) { snippet in
        SnippetTile(
          snippet: snippet,
          accent: accent,
          showsPreview: family != .systemSmall
        )
      }
    }
  }
}
