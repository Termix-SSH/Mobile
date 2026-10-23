import Foundation

private final class NoSink: ShellSink, @unchecked Sendable {
    func onData(_ data: Data) {}
    func onExit(_ code: Int?) {}
}

/// Touches every engine feature once. The Expo spike modules call it so the size builds keep all code.
public func probe(_ engine: SshEngine, _ config: SshConfig, _ callbacks: SshCallbacks) async throws -> String {
    let s = try await engine.connect(config, callbacks)
    var out = String(decoding: try await s.exec("uname -a").stdout, as: UTF8.self)
    let sh = try await s.openShell(term: "xterm-256color", cols: 80, rows: 24, env: [:], sink: NoSink())
    try await sh.resize(cols: 100, rows: 30)
    try await sh.close()
    out += String(try await s.list(".").count)
    try await s.forwardLocal(bindPort: 0, host: "127.0.0.1", port: 22).close()
    try await s.forwardDynamic(bindPort: 0).close()
    if let hop = try? await s.connectVia(config, callbacks) { await hop.close() }
    await s.close()
    return out
}
