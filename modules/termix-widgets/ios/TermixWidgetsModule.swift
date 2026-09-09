import ExpoModulesCore
import WidgetKit

/**
 Bridges the JS widget layer to WidgetKit.

 The app writes one JSON snapshot into the shared App Group container; the
 widget extension reads it back. Keeping the transport to a single string keeps
 the two sides decoupled — the contract lives in `app/widgets/types.ts`.
 */
public class TermixWidgetsModule: Module {
  /// Info.plist key injected by `plugins/withTermixWidgets.js`.
  private static let appGroupInfoKey = "TermixWidgetsAppGroup"

  /// Shared key. Must match `SharedStore.snapshotKey` in the widget target.
  private static let snapshotKey = "termix.widget.snapshot.v1"

  public func definition() -> ModuleDefinition {
    Name("TermixWidgets")

    Constants([
      "isSupported": TermixWidgetsModule.isSupported,
      "containerId": TermixWidgetsModule.appGroupId ?? "",
    ])

    AsyncFunction("setSnapshot") { (json: String) in
      try TermixWidgetsModule.write(json)
      TermixWidgetsModule.reload()
    }

    AsyncFunction("clearSnapshot") {
      try TermixWidgetsModule.write(nil)
      TermixWidgetsModule.reload()
    }

    AsyncFunction("reloadWidgets") {
      TermixWidgetsModule.reload()
    }
  }

  // MARK: - Shared container

  /// App Group identifier the extension and the app share.
  private static var appGroupId: String? {
    guard
      let value = Bundle.main.object(forInfoDictionaryKey: appGroupInfoKey) as? String,
      !value.isEmpty
    else {
      return nil
    }
    return value
  }

  /// Widgets need both WidgetKit (iOS 14+) and a configured App Group.
  private static var isSupported: Bool {
    if #available(iOS 14.0, *) {
      return appGroupId != nil
    }
    return false
  }

  private static func write(_ json: String?) throws {
    guard let groupId = appGroupId else {
      throw Exception(
        name: "ERR_TERMIX_WIDGETS_NO_APP_GROUP",
        description: "No App Group is configured; the widget extension is not installed in this build."
      )
    }
    guard let defaults = UserDefaults(suiteName: groupId) else {
      throw Exception(
        name: "ERR_TERMIX_WIDGETS_CONTAINER",
        description: "The shared container \(groupId) is not accessible."
      )
    }

    if let json {
      defaults.set(json, forKey: snapshotKey)
    } else {
      defaults.removeObject(forKey: snapshotKey)
    }
  }

  private static func reload() {
    guard #available(iOS 14.0, *) else { return }
    WidgetCenter.shared.reloadAllTimelines()
  }
}
