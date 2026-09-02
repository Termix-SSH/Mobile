import ExpoModulesCore
import Foundation

public class TermixTailscaleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TermixTailscale")

    Function("isAvailable") { () -> Bool in
      TermixTSBridge.isAvailable()
    }

    AsyncFunction("getDefaultStateDir") { () -> String in
      TermixTSBridge.defaultStateDir()
    }

    // Bridge API returns nil / error strings (no NSError**), so Swift calls are
    // plain and do not depend on throwing-import name mangling.

    AsyncFunction("configure") { (options: [String: Any]) in
      let authKey = options["authKey"] as? String ?? ""
      let hostname = options["hostname"] as? String ?? "termix-mobile"
      let stateDir = options["stateDir"] as? String ?? TermixTSBridge.defaultStateDir()
      let ephemeral = options["ephemeral"] as? Bool ?? false

      if let message = TermixTSBridge.configure(
        withAuthKey: authKey,
        hostname: hostname,
        stateDir: stateDir,
        ephemeral: ephemeral
      ) {
        throw makeError(message)
      }
    }

    AsyncFunction("up") {
      if let message = TermixTSBridge.up() {
        throw makeError(message)
      }
    }

    AsyncFunction("startForward") { (scheme: String, remoteHost: String, remotePort: Int) -> Int in
      let result = TermixTSBridge.startForward(
        withProtocol: scheme,
        host: remoteHost,
        port: Int32(remotePort)
      )
      if let message = result["error"] as? String {
        throw makeError(message)
      }
      guard let portNumber = result["localPort"] as? NSNumber else {
        throw makeError("startForward returned no localPort")
      }
      return portNumber.intValue
    }

    AsyncFunction("stopForward") { (scheme: String, remoteHost: String, remotePort: Int, localPort: Int) in
      if let message = TermixTSBridge.stopForward(
        withProtocol: scheme,
        host: remoteHost,
        port: Int32(remotePort),
        localPort: Int32(localPort)
      ) {
        throw makeError(message)
      }
    }

    AsyncFunction("stopAllForwards") {
      TermixTSBridge.stopAllForwards()
    }

    AsyncFunction("isForwardActive") { (scheme: String, remoteHost: String, remotePort: Int, localPort: Int) -> Bool in
      TermixTSBridge.isForwardActive(
        withProtocol: scheme,
        host: remoteHost,
        port: Int32(remotePort),
        localPort: Int32(localPort)
      )
    }

    AsyncFunction("isUp") { () -> Bool in
      TermixTSBridge.isUp()
    }

    AsyncFunction("getIPs") { () -> String in
      TermixTSBridge.ips()
    }

    AsyncFunction("close") {
      if let message = TermixTSBridge.close() {
        throw makeError(message)
      }
    }
  }
}

private func makeError(_ message: String) -> NSError {
  NSError(
    domain: "TermixTailscale",
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: message]
  )
}
