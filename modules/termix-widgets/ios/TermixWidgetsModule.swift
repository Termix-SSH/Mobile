import ExpoModulesCore
import Foundation
import Security
import WidgetKit

/**
 Bridges the JS widget layer to WidgetKit.

 The app writes one JSON snapshot into the shared App Group container; the
 widget extension reads it back. Keeping the transport to a single string keeps
 the two sides decoupled - the contract lives in `src/widgets/types.ts`.
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

    AsyncFunction("setPowerSnapshot") { (json: String) in
      let defaults = try TermixWidgetsModule.sharedDefaults()
      defaults.set(json, forKey: TermixWidgetsModule.powerSnapshotKey)
      // Drop access of servers that have no device left on the widget.
      let accountIds = TermixWidgetsModule.accountIds(inPowerSnapshot: json)
      var access = TermixWidgetsModule.readPowerAccess()
      let kept = access.filter { accountIds.contains($0.key) }
      if kept.count != access.count {
        access = kept
        try TermixWidgetsModule.writePowerAccess(access)
      }
      TermixWidgetsModule.reload()
    }

    AsyncFunction("setPowerAccess") { (accountId: String, json: String?) in
      var access = TermixWidgetsModule.readPowerAccess()
      if let json, !json.isEmpty {
        access[accountId] = json
      } else {
        access.removeValue(forKey: accountId)
      }
      try TermixWidgetsModule.writePowerAccess(access)
    }

    AsyncFunction("clearPower") {
      let defaults = try TermixWidgetsModule.sharedDefaults()
      defaults.removeObject(forKey: TermixWidgetsModule.powerSnapshotKey)
      defaults.removeObject(forKey: TermixWidgetsModule.powerOverridesKey)
      try TermixWidgetsModule.writePowerAccess([:])
      TermixWidgetsModule.reload()
    }
  }

  // MARK: - Power widget

  /// Must match `PowerStore` in the widget target.
  private static let powerSnapshotKey = "termix.widget.power.v1"
  private static let powerOverridesKey = "termix.widget.power.overrides.v1"
  private static let powerKeychainService = "termix.widget.power"
  private static let powerKeychainAccount = "access"

  private static func sharedDefaults() throws -> UserDefaults {
    guard let groupId = appGroupId, let defaults = UserDefaults(suiteName: groupId) else {
      throw Exception(
        name: "ERR_TERMIX_WIDGETS_NO_APP_GROUP",
        description: "No App Group is configured; the widget extension is not installed in this build."
      )
    }
    return defaults
  }

  private static func accountIds(inPowerSnapshot json: String) -> Set<String> {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let devices = object["devices"] as? [[String: Any]]
    else {
      return []
    }
    return Set(devices.compactMap { $0["accountId"] as? String })
  }

  private static func keychainQuery() -> [String: Any]? {
    guard let groupId = appGroupId else { return nil }
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: powerKeychainService,
      kSecAttrAccount as String: powerKeychainAccount,
      // App groups double as keychain access groups, so the extension can read it.
      kSecAttrAccessGroup as String: groupId,
    ]
  }

  /// Account id to the access JSON the app wrote for it.
  private static func readPowerAccess() -> [String: String] {
    guard var query = keychainQuery() else { return [:] }
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    guard
      SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data,
      let map = try? JSONDecoder().decode([String: String].self, from: data)
    else {
      return [:]
    }
    return map
  }

  private static func writePowerAccess(_ access: [String: String]) throws {
    guard let query = keychainQuery() else { return }
    SecItemDelete(query as CFDictionary)
    if access.isEmpty { return }
    var item = query
    item[kSecValueData as String] = try JSONEncoder().encode(access)
    // The widget runs while the phone is locked, after the first unlock.
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(item as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw Exception(
        name: "ERR_TERMIX_WIDGETS_KEYCHAIN",
        description: "Could not save the Power widget access (\(status))."
      )
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
