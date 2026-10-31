import ExpoModulesCore
import UIKit

/**
 * iOS has no long running background mode for SSH. This only asks for the
 * short finishing time iOS gives any app, so a quick app switch keeps the
 * sessions open. When the time runs out the task ends and iOS suspends us.
 */
public class TermixSessionServiceModule: Module {
  private var task: UIBackgroundTaskIdentifier = .invalid

  public func definition() -> ModuleDefinition {
    Name("TermixSessionService")

    Constant("isSupported") { true }

    Events("onDisconnectAll")

    Function("show") { (_: String, _: [String], _: String, _: String) -> Bool in
      false
    }
    Function("hide") {}
    Function("isRunning") { false }
    Function("notificationsEnabled") { true }
    Function("ignoresBatteryOptimizations") { true }
    Function("openBatteryOptimizationSettings") { false }
    Function("openNotificationSettings") { false }

    AsyncFunction("beginGrace") {
      self.begin()
    }.runOnQueue(.main)

    AsyncFunction("endGrace") {
      self.end()
    }.runOnQueue(.main)
  }

  private func begin() {
    if task != .invalid { return }
    task = UIApplication.shared.beginBackgroundTask(withName: "termix.sessions") { [weak self] in
      self?.end()
    }
  }

  private func end() {
    if task == .invalid { return }
    UIApplication.shared.endBackgroundTask(task)
    task = .invalid
  }
}
