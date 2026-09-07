import WidgetKit
import SwiftUI

/**
 Snippets — the commands you keep reaching for, one tap from the home screen.

 Tapping a snippet opens Termix and asks which host to run it on. Only the
 snippet id travels in the deep link; the command itself is read (and executed)
 inside the authenticated app.
 */
struct SnippetsWidget: Widget {
  static let kind = "TermixSnippetsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: TermixProvider()) { entry in
      SnippetsView(entry: entry)
    }
    .configurationDisplayName("Snippets")
    .description("Run a saved command on a server.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

/**
 iOS 17+ variant.

 Snippets have nothing to configure, so this exists only to opt out of the
 accented/vibrant rendering modes the way the other two widgets do.
 */
@available(iOSApplicationExtension 17.0, *)
struct ModernSnippetsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: SnippetsWidget.kind, provider: TermixProvider()) { entry in
      SnippetsView(entry: entry)
    }
    .configurationDisplayName("Snippets")
    .description("Run a saved command on a server.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    .termixFullColor()
  }
}

struct SnippetsView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TermixEntry

  private var snapshot: WidgetSnapshot { entry.snapshot }
  private var accent: Color { Theme.accent(snapshot.accent) }

  // Counts that fit the container. Overshooting here does not clip cleanly, the
  // widget gallery renders the overflow running off the preview. Medium fits
  // two: with the header and footer, a third tile pushed both off the preview.
  private var capacity: Int {
    switch family {
    case .systemSmall: return 2
    case .systemMedium: return 2
    default: return 7
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
    // No manual padding: iOS applies its own content margins inside
    // `containerBackground`, and adding to them is what made the gallery
    // previews disagree per family.
    .widgetBackground()
    .unredacted()
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
    // The clipped container guarantees nothing escapes the widget even at a
    // large Dynamic Type size.
    VStack(spacing: 6) {
      ForEach(visible) { snippet in
        SnippetTile(
          snippet: snippet,
          accent: accent,
          showsPreview: family != .systemSmall
        )
      }
    }
    .frame(maxWidth: .infinity, alignment: .top)
    .clipped()
  }
}
