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
