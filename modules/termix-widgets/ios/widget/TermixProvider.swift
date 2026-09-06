import WidgetKit
import SwiftUI

/**
 Timeline provider shared by both widget kinds.

 There is no network access here by design: the extension only reads what the
 app already published. It still schedules a periodic refresh so the "updated
 3m ago" footer stays honest even when the app hasn't run in a while.
 */
struct TermixEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
  /// True when the user picked a host in "Edit Widget", so the views know to
  /// keep it in front rather than applying their own ranking.
  var hasExplicitHost: Bool = false
  /// Which tab a tap opens. Terminal unless the user chose otherwise.
  var opens: SessionKind = .terminal
}

struct TermixProvider: TimelineProvider {
  /// How often the extension re-renders from the already-stored snapshot.
  private static let refreshInterval: TimeInterval = 15 * 60

  func placeholder(in context: Context) -> TermixEntry {
    TermixEntry(date: Date(), snapshot: .placeholder)
  }

  func getSnapshot(in context: Context, completion: @escaping (TermixEntry) -> Void) {
    // The gallery preview should always look populated.
    let snapshot = context.isPreview ? WidgetSnapshot.placeholder : SharedStore.loadSnapshot()
    completion(TermixEntry(date: Date(), snapshot: snapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TermixEntry>) -> Void) {
    let now = Date()
    let entry = TermixEntry(date: now, snapshot: SharedStore.loadSnapshot())
    let next = now.addingTimeInterval(Self.refreshInterval)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

/// Splits hosts into rows of `size` for the tile grids.
func chunked<T>(_ items: [T], into size: Int) -> [[T]] {
  guard size > 0 else { return [items] }
  return stride(from: 0, to: items.count, by: size).map { start in
    Array(items[start..<min(start + size, items.count)])
  }
}

#if canImport(AppIntents)
  import AppIntents

  /**
   Timeline provider for the configurable widgets (iOS 17+).

   Identical to `TermixProvider` except that it carries the user's host choice
   through to the view, which moves that host to the front of the list.
   */
  @available(iOSApplicationExtension 17.0, *)
  struct TermixConfigurableProvider: AppIntentTimelineProvider {
    private static let refreshInterval: TimeInterval = 15 * 60

    func placeholder(in context: Context) -> TermixEntry {
      TermixEntry(date: Date(), snapshot: .placeholder)
    }

    /**
     Applies the user's choice.

     The choice lives in WidgetKit's configuration store, which the app cannot
     clear on sign-out, so it can outlive the account it was made against. Host
     ids are assigned by the backend and restart per server, so the name is
     checked too: matching on the id alone would let a widget silently bind to
     an unrelated host that happens to reuse the id after switching accounts.

     A choice that no longer resolves falls back to the automatic ordering
     rather than rendering an empty widget.
     */
    private func entry(for configuration: SelectHostIntent, snapshot: WidgetSnapshot, date: Date)
      -> TermixEntry
    {
      let resolved = configuration.host.flatMap { choice in
        snapshot.hosts.first { $0.id == choice.id && $0.name == choice.name }
      }
      return TermixEntry(
        date: date,
        snapshot: snapshot.prioritizing(hostId: resolved?.id),
        hasExplicitHost: resolved != nil,
        opens: configuration.sessionKind
      )
    }

    func snapshot(for configuration: SelectHostIntent, in context: Context) async -> TermixEntry {
      let snapshot = context.isPreview ? WidgetSnapshot.placeholder : SharedStore.loadSnapshot()
      return entry(for: configuration, snapshot: snapshot, date: Date())
    }

    func timeline(for configuration: SelectHostIntent, in context: Context) async -> Timeline<TermixEntry> {
      let now = Date()
      let entry = entry(for: configuration, snapshot: SharedStore.loadSnapshot(), date: now)
      return Timeline(entries: [entry], policy: .after(now.addingTimeInterval(Self.refreshInterval)))
    }
  }
#endif
