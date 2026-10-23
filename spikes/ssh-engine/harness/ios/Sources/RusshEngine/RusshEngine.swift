import Foundation
import SshApi

// Generated/termix_ssh_core.swift is copied in by scripts/ios-prepare.sh.

private func toFfi(_ c: SshConfig) -> ConnectConfig {
    ConnectConfig(
        host: c.host, port: UInt16(c.port), username: c.username, password: c.password, privateKey: c.privateKey,
        passphrase: c.passphrase, certificate: c.certificate, forceKeyboardInteractive: c.forceKeyboardInteractive,
        allowLegacyAlgorithms: c.allowLegacyAlgorithms, connectTimeoutSecs: UInt32(c.connectTimeoutSecs),
        keepaliveIntervalSecs: UInt32(c.keepaliveIntervalSecs), keepaliveCountMax: UInt32(c.keepaliveCountMax)
    )
}

private func toApi(_ k: HostKeyInfo) -> HostKey {
    HostKey(keyType: k.keyType, blobHex: k.blobHex, sha256: k.sha256, isCertificate: k.isCertificate,
            caSha256: k.caSha256, principals: k.principals)
}

private func mapError(_ e: Error) -> Error {
    guard let e = e as? SshError else { return e }
    switch e {
    case let .Connect(msg): return SshFailure(.connect, msg)
    case .HostKeyRejected: return SshFailure(.hostkeyRejected, "rejected")
    case .PassphraseRequired: return SshFailure(.passphraseRequired, "needs passphrase")
    case .BadPassphrase: return SshFailure(.badPassphrase, "wrong passphrase")
    case let .InvalidKey(msg): return SshFailure(.invalidKey, msg)
    case let .Auth(msg): return SshFailure(.auth, msg)
    case .AuthCancelled: return SshFailure(.authCancelled, "cancelled")
    case let .Channel(msg): return SshFailure(.channel, msg)
    case let .Sftp(msg): return SshFailure(.sftp, msg)
    case let .Io(msg): return SshFailure(.io, msg)
    case .Disconnected: return SshFailure(.disconnected, "disconnected")
    }
}

private func ffi<T>(_ block: () async throws -> T) async throws -> T {
    do { return try await block() } catch { throw mapError(error) }
}

private final class Bridge: SessionCallbacks, @unchecked Sendable {
    let cb: SshCallbacks
    init(_ cb: SshCallbacks) { self.cb = cb }
    func verifyHostKey(info: HostKeyInfo) async -> Bool { await cb.verifyHostKey(toApi(info)) }
    func keyboardInteractive(request: KbdRequest) async -> [String]? {
        await cb.keyboardInteractive(KbdRound(name: request.name, instructions: request.instructions,
                                              prompts: request.prompts.map { ($0.prompt, $0.echo) }, round: Int(request.round)))
    }
    func onBanner(banner: String) {}
    func onDisconnect(reason: String) { cb.onDisconnect(reason) }
}

private final class SinkBridge: ShellCallbacks, @unchecked Sendable {
    let sink: ShellSink
    init(_ sink: ShellSink) { self.sink = sink }
    func onData(data: Data) { sink.onData(data) }
    func onExit(exitCode: UInt32?) { sink.onExit(exitCode.map { Int($0) }) }
}

private final class ProgressBridge: ProgressCallback, @unchecked Sendable {
    let fn: SshApi.Progress
    init(_ fn: @escaping SshApi.Progress) { self.fn = fn }
    func onProgress(done: UInt64, total: UInt64) { fn(done, total) }
}

private struct RShell: SshShell {
    let sh: Shell
    func write(_ data: Data) async throws { try await ffi { try await sh.write(data: data) } }
    func resize(cols: Int, rows: Int) async throws { try await ffi { try await sh.resize(cols: UInt32(cols), rows: UInt32(rows)) } }
    func close() async throws { try await ffi { try await sh.end() } }
}

private struct RForward: SshForward {
    let f: Forward
    var port: Int { Int(f.port()) }
    func close() { f.stop() }
}

private final class RSession: SshSession, @unchecked Sendable {
    let s: Session
    private var sftp: Sftp?
    init(_ s: Session) { self.s = s }

    var hostKey: HostKey { toApi(s.hostKey()) }
    var algorithms: [String] { s.algorithms().map { [$0.kex, $0.hostKey, $0.cipher, $0.mac] } ?? [] }
    var isClosed: Bool { s.isClosed() }

    private func channel() async throws -> Sftp {
        if let sftp { return sftp }
        let n = try await s.openSftp()
        sftp = n
        return n
    }

    func connectVia(_ config: SshConfig, _ callbacks: SshCallbacks) async throws -> SshSession {
        try await ffi { RSession(try await s.connectVia(config: toFfi(config), callbacks: Bridge(callbacks))) }
    }

    func exec(_ command: String) async throws -> ExecOut {
        try await ffi {
            let r = try await s.exec(command: command)
            return ExecOut(stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode.map { Int($0) })
        }
    }

    func openShell(term: String, cols: Int, rows: Int, env: [String: String], sink: ShellSink) async throws -> SshShell {
        try await ffi {
            RShell(sh: try await s.openShell(term: term, cols: UInt32(cols), rows: UInt32(rows),
                                            env: env.map { EnvVar(name: $0.key, value: $0.value) }, callbacks: SinkBridge(sink)))
        }
    }

    func list(_ path: String) async throws -> [RemoteFile] {
        try await ffi { try await channel().list(path: path).map { RemoteFile(name: $0.name, size: $0.size, isDir: $0.isDir) } }
    }

    func download(_ remote: String, to local: String, progress: SshApi.Progress?) async throws -> Transfer {
        try await ffi {
            let r = try await channel().download(remote: remote, local: local, progress: progress.map { ProgressBridge($0) })
            return Transfer(bytes: r.bytes, millis: r.millis)
        }
    }

    func upload(_ local: String, to remote: String, progress: SshApi.Progress?) async throws -> Transfer {
        try await ffi {
            let r = try await channel().upload(local: local, remote: remote, progress: progress.map { ProgressBridge($0) })
            return Transfer(bytes: r.bytes, millis: r.millis)
        }
    }

    func remove(_ path: String) async throws { try await ffi { try await channel().remove(path: path) } }

    func forwardLocal(bindPort: Int, host: String, port: Int) async throws -> SshForward {
        try await ffi { RForward(f: try await s.forwardLocal(bindHost: "127.0.0.1", bindPort: UInt16(bindPort), remoteHost: host, remotePort: UInt16(port))) }
    }

    func forwardDynamic(bindPort: Int) async throws -> SshForward {
        try await ffi { RForward(f: try await s.forwardDynamic(bindHost: "127.0.0.1", bindPort: UInt16(bindPort))) }
    }

    func close() async { try? await s.disconnect() }
}

public struct RusshEngine: SshEngine {
    public init() {}
    public var name: String { "russh" }
    public var version: String { engineVersion() }
    public func connect(_ config: SshConfig, _ callbacks: SshCallbacks) async throws -> SshSession {
        try await ffi { RSession(try await RusshEngine_connect(toFfi(config), Bridge(callbacks))) }
    }
}

// The generated free function is also called connect, so give it a distinct name here.
private func RusshEngine_connect(_ c: ConnectConfig, _ cb: SessionCallbacks) async throws -> Session {
    try await connect(config: c, callbacks: cb)
}
