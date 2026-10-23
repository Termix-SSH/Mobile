import Foundation
import SshApi
import TermixSsh2C

/// Reads a fixed C char array field as a String.
private func cstr<T>(_ field: T) -> String {
    var f = field
    return withUnsafePointer(to: &f) { String(cString: UnsafeRawPointer($0).assumingMemoryBound(to: CChar.self)) }
}

private func failure(_ e: tx_error) -> SshFailure {
    SshFailure(FailureKind(rawValue: Int(e.code)) ?? .io, cstr(e.message))
}

/// Runs a blocking C call off the cooperative pool.
private func blocking<T>(_ f: @escaping () throws -> T) async throws -> T {
    try await withCheckedThrowingContinuation { cont in
        DispatchQueue.global().async { cont.resume(with: Result { try f() }) }
    }
}

/// Waits for an async callback from a C thread. Blocking there only pauses that session.
private func wait<T>(_ f: @escaping () async -> T) -> T {
    let sem = DispatchSemaphore(value: 0)
    let box = ResultBox<T>()
    Task.detached {
        box.value = await f()
        sem.signal()
    }
    sem.wait()
    return box.value!
}

private final class ResultBox<T>: @unchecked Sendable { var value: T? }

private final class SessionBox {
    let cb: SshCallbacks
    var hostKey: HostKey?
    init(_ cb: SshCallbacks) { self.cb = cb }
}

private final class SinkBox {
    let sink: ShellSink
    init(_ sink: ShellSink) { self.sink = sink }
}

private final class ProgressBox {
    let fn: SshApi.Progress
    init(_ fn: @escaping SshApi.Progress) { self.fn = fn }
}

private let verifyFn: @convention(c) (UnsafeMutableRawPointer?, UnsafePointer<tx_host_key>?) -> Int32 = { ctx, k in
    let box = Unmanaged<SessionBox>.fromOpaque(ctx!).takeUnretainedValue()
    let p = k!.pointee
    let principals = cstr(p.principals).split(separator: ",").map(String.init)
    let ca = cstr(p.ca_sha256)
    let key = HostKey(keyType: cstr(p.key_type), blobHex: cstr(p.blob_hex), sha256: cstr(p.sha256),
                      isCertificate: p.is_certificate != 0, caSha256: ca.isEmpty ? nil : ca, principals: principals)
    box.hostKey = key
    return wait { await box.cb.verifyHostKey(key) } ? 1 : 0
}

private let kbdFn: @convention(c) (UnsafeMutableRawPointer?, UnsafePointer<CChar>?, UnsafePointer<CChar>?, Int32,
                                   UnsafeMutablePointer<UnsafePointer<CChar>?>?, UnsafePointer<Int32>?,
                                   UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?, Int32) -> Int32 = { ctx, name, ins, n, prompts, echo, answers, round in
    let box = Unmanaged<SessionBox>.fromOpaque(ctx!).takeUnretainedValue()
    let ps = (0..<Int(n)).map { (String(cString: prompts![$0]!), echo![$0] != 0) }
    let r = KbdRound(name: String(cString: name!), instructions: String(cString: ins!), prompts: ps, round: Int(round))
    guard let res = wait({ await box.cb.keyboardInteractive(r) }) else { return -1 }
    for i in 0..<min(Int(n), res.count) { answers![i] = strdup(res[i]) }
    return 0
}

private let discFn: @convention(c) (UnsafeMutableRawPointer?, UnsafePointer<CChar>?) -> Void = { ctx, reason in
    Unmanaged<SessionBox>.fromOpaque(ctx!).takeUnretainedValue().cb.onDisconnect(String(cString: reason!))
}

private let dataFn: @convention(c) (UnsafeMutableRawPointer?, UnsafePointer<CChar>?, Int) -> Void = { ctx, d, n in
    Unmanaged<SinkBox>.fromOpaque(ctx!).takeUnretainedValue().sink.onData(Data(bytes: d!, count: n))
}

private let exitFn: @convention(c) (UnsafeMutableRawPointer?, Int32, Int32) -> Void = { ctx, has, code in
    Unmanaged<SinkBox>.fromOpaque(ctx!).takeUnretainedValue().sink.onExit(has != 0 ? Int(code) : nil)
}

private let progressFn: @convention(c) (UnsafeMutableRawPointer?, UInt64, UInt64) -> Void = { ctx, done, total in
    Unmanaged<ProgressBox>.fromOpaque(ctx!).takeUnretainedValue().fn(done, total)
}

private struct LShell: SshShell {
    let sh: OpaquePointer
    func write(_ data: Data) async throws {
        let rc = data.withUnsafeBytes { tx_shell_write(sh, $0.baseAddress!.assumingMemoryBound(to: CChar.self), data.count) }
        if rc != 0 { throw SshFailure(.disconnected, "shell closed") }
    }
    func resize(cols: Int, rows: Int) async throws { tx_shell_resize(sh, Int32(cols), Int32(rows)) }
    func close() async throws { tx_shell_close(sh) }
}

private struct LForward: SshForward {
    let f: OpaquePointer
    var port: Int { Int(tx_forward_port(f)) }
    func close() { tx_forward_close(f) }
}

private final class LSession: SshSession, @unchecked Sendable {
    let s: OpaquePointer
    let box: Unmanaged<SessionBox>
    let hostKey: HostKey
    private let lock = NSLock()
    private var shells = [(OpaquePointer, Unmanaged<SinkBox>)]()
    private var children = [LSession]()
    private var freed = false

    init(_ s: OpaquePointer, _ box: Unmanaged<SessionBox>) {
        self.s = s
        self.box = box
        hostKey = box.takeUnretainedValue().hostKey!
    }

    var algorithms: [String] {
        var a = tx_algorithms()
        tx_algorithms_info(s, &a)
        return [cstr(a.kex), cstr(a.host_key), cstr(a.cipher), cstr(a.mac)]
    }

    var isClosed: Bool { lock.lock(); defer { lock.unlock() }; return freed || tx_is_closed(s) != 0 }

    func connectVia(_ config: SshConfig, _ callbacks: SshCallbacks) async throws -> SshSession {
        let child = try await LSession.open(parent: s, config, callbacks)
        lock.lock(); children.append(child); lock.unlock()
        return child
    }

    func exec(_ command: String) async throws -> ExecOut {
        try await blocking { [s] in
            var out: UnsafeMutablePointer<CChar>?, err: UnsafeMutablePointer<CChar>?
            var ol = 0, el = 0
            var code: Int32 = -1
            var e = tx_error()
            if tx_exec(s, command, &out, &ol, &err, &el, &code, &e) != 0 { throw failure(e) }
            defer { free(out); free(err) }
            return ExecOut(stdout: Data(bytes: out!, count: ol), stderr: Data(bytes: err!, count: el), exitCode: Int(code))
        }
    }

    func openShell(term: String, cols: Int, rows: Int, env: [String: String], sink: ShellSink) async throws -> SshShell {
        let sb = Unmanaged.passRetained(SinkBox(sink))
        let sh: OpaquePointer = try await blocking { [s] in
            var names = env.keys.map { UnsafePointer<CChar>?(strdup($0)) }
            var values = env.values.map { UnsafePointer<CChar>?(strdup($0)) }
            defer { names.forEach { free(UnsafeMutablePointer(mutating: $0)) }; values.forEach { free(UnsafeMutablePointer(mutating: $0)) } }
            var cb = tx_shell_callbacks(ctx: sb.toOpaque(), on_data: dataFn, on_exit: exitFn)
            var e = tx_error()
            guard let sh = tx_shell_open(s, term, Int32(cols), Int32(rows), &names, &values, Int32(env.count), &cb, &e) else {
                sb.release()
                throw failure(e)
            }
            return sh
        }
        lock.lock(); shells.append((sh, sb)); lock.unlock()
        return LShell(sh: sh)
    }

    func list(_ path: String) async throws -> [RemoteFile] {
        try await blocking { [s] in
            var ents: UnsafeMutablePointer<tx_file_entry>?
            var count: Int32 = 0
            var e = tx_error()
            if tx_sftp_list(s, path, &ents, &count, &e) != 0 { throw failure(e) }
            defer { tx_free_entries(ents, count) }
            return (0..<Int(count)).map { RemoteFile(name: String(cString: ents![$0].name), size: ents![$0].size, isDir: ents![$0].is_dir != 0) }
        }
    }

    private func transfer(_ up: Bool, _ a: String, _ b: String, _ progress: SshApi.Progress?) async throws -> Transfer {
        try await blocking { [s] in
            let pb = progress.map { Unmanaged.passRetained(ProgressBox($0)) }
            defer { pb?.release() }
            var bytes: UInt64 = 0, ms: UInt64 = 0
            var e = tx_error()
            let fn: tx_progress_fn? = pb == nil ? nil : progressFn
            let rc = up ? tx_sftp_upload(s, a, b, fn, pb?.toOpaque(), &bytes, &ms, &e)
                        : tx_sftp_download(s, a, b, fn, pb?.toOpaque(), &bytes, &ms, &e)
            if rc != 0 { throw failure(e) }
            return Transfer(bytes: bytes, millis: ms)
        }
    }

    func download(_ remote: String, to local: String, progress: SshApi.Progress?) async throws -> Transfer {
        try await transfer(false, remote, local, progress)
    }

    func upload(_ local: String, to remote: String, progress: SshApi.Progress?) async throws -> Transfer {
        try await transfer(true, local, remote, progress)
    }

    func remove(_ path: String) async throws {
        try await blocking { [s] in
            var e = tx_error()
            if tx_sftp_remove(s, path, &e) != 0 { throw failure(e) }
        }
    }

    func forwardLocal(bindPort: Int, host: String, port: Int) async throws -> SshForward {
        try await blocking { [s] in
            var e = tx_error()
            guard let f = tx_forward_local(s, "127.0.0.1", Int32(bindPort), host, Int32(port), &e) else { throw failure(e) }
            return LForward(f: f)
        }
    }

    func forwardDynamic(bindPort: Int) async throws -> SshForward {
        try await blocking { [s] in
            var e = tx_error()
            guard let f = tx_forward_dynamic(s, "127.0.0.1", Int32(bindPort), &e) else { throw failure(e) }
            return LForward(f: f)
        }
    }

    func close() async {
        lock.lock()
        if freed { lock.unlock(); return }
        freed = true
        let kids = children
        lock.unlock()
        for k in kids { await k.close() }
        _ = try? await blocking { [s, box] in
            tx_free(s)
            box.release()
        }
        lock.lock()
        for (sh, sb) in shells { tx_shell_free(sh); sb.release() }
        shells.removeAll()
        lock.unlock()
    }

    static func open(parent: OpaquePointer?, _ c: SshConfig, _ cb: SshCallbacks) async throws -> LSession {
        let box = Unmanaged.passRetained(SessionBox(cb))
        let s: OpaquePointer = try await blocking {
            let strs: [UnsafeMutablePointer<CChar>?] = [c.host, c.username, c.password, c.privateKey, c.passphrase, c.certificate]
                .map { $0.flatMap { strdup($0) } }
            defer { strs.forEach { free($0) } }
            var cfg = tx_config()
            cfg.host = UnsafePointer(strs[0])
            cfg.port = Int32(c.port)
            cfg.username = UnsafePointer(strs[1])
            cfg.password = strs[2].map { UnsafePointer($0) }
            cfg.private_key = strs[3].map { UnsafePointer($0) }
            cfg.passphrase = strs[4].map { UnsafePointer($0) }
            cfg.certificate = strs[5].map { UnsafePointer($0) }
            cfg.force_keyboard_interactive = c.forceKeyboardInteractive ? 1 : 0
            cfg.allow_legacy_algorithms = c.allowLegacyAlgorithms ? 1 : 0
            cfg.connect_timeout_secs = Int32(c.connectTimeoutSecs)
            cfg.keepalive_interval_secs = Int32(c.keepaliveIntervalSecs)
            cfg.keepalive_count_max = Int32(c.keepaliveCountMax)
            var cbs = tx_callbacks(ctx: box.toOpaque(), verify_host_key: verifyFn, keyboard_interactive: kbdFn,
                                   on_banner: nil, on_disconnect: discFn)
            var e = tx_error()
            let s = parent == nil ? tx_connect(&cfg, &cbs, &e) : tx_connect_via(parent, &cfg, &cbs, &e)
            guard let s else {
                box.release()
                throw failure(e)
            }
            return s
        }
        return LSession(s, box)
    }
}

public struct Libssh2Engine: SshEngine {
    public init() {}
    public var name: String { "libssh2" }
    public var version: String { String(cString: tx_version()) }
    public func connect(_ config: SshConfig, _ callbacks: SshCallbacks) async throws -> SshSession {
        try await LSession.open(parent: nil, config, callbacks)
    }
}
