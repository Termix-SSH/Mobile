import Foundation

/**
 Reads the snapshot the app writes into the shared App Group container.

 Failure is never fatal: an unreadable, malformed, or future-versioned payload
 degrades to the signed-out state rather than an empty or broken widget.
 */
enum SharedStore {
  /// Must match `TermixWidgetsModule.snapshotKey` in the app target.
  static let snapshotKey = "termix.widget.snapshot.v1"

  /// Injected into the extension's Info.plist by `plugins/withTermixWidgets.js`.
  private static let appGroupInfoKey = "TermixWidgetsAppGroup"

  static var appGroupId: String? {
    guard
      let value = Bundle.main.object(forInfoDictionaryKey: appGroupInfoKey) as? String,
      !value.isEmpty
    else {
      return nil
    }
    return value
  }

  static func loadSnapshot() -> WidgetSnapshot {
    guard
      let groupId = appGroupId,
      let defaults = UserDefaults(suiteName: groupId),
      let json = defaults.string(forKey: snapshotKey),
      let data = json.data(using: .utf8)
    else {
      return .signedOut()
    }

    do {
      let snapshot = try JSONDecoder().decode(WidgetSnapshot.self, from: data)
      // A payload written by a newer app version may mean something different;
      // showing the signed-out card is safer than rendering it wrong.
      guard snapshot.version == WidgetSnapshot.supportedVersion else {
        return .signedOut(accent: snapshot.accent)
      }
      return snapshot
    } catch {
      return .signedOut()
    }
  }
}
