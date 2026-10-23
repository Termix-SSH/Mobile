import ExpoModulesCore

private final class AcceptAll: SshCallbacks, @unchecked Sendable {
  func verifyHostKey(_ key: HostKey) async -> Bool { true }
  func keyboardInteractive(_ round: KbdRound) async -> [String]? { nil }
  func onDisconnect(_ reason: String) {}
}

public class TermixSshLibssh2Module: Module {
  private let engine = Libssh2Engine()

  public func definition() -> ModuleDefinition {
    Name("TermixSshLibssh2")

    Function("version") { self.engine.version }

    AsyncFunction("probe") { (host: String, port: Int, user: String, password: String) async throws -> String in
      try await probe(self.engine, SshConfig(host: host, port: port, username: user, password: password), AcceptAll())
    }
  }
}
