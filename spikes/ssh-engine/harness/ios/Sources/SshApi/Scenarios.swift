import CommonCrypto
import CryptoKit
import Darwin
import Foundation

/// Where the test servers are and how to measure things on this platform.
public struct TestEnv: Sendable {
    public var host: String
    public var platform: String
    public var keys: @Sendable (String) -> String
    public var algosJson: String
    public var tempDir: URL
    public var memory: @Sendable () -> UInt64
    public var record: @Sendable (String) -> Void
    public var targetPort = 2222
    public var jumpPort = 2223
    public var jumpTarget = "target"

    public init(host: String, platform: String, keys: @escaping @Sendable (String) -> String, algosJson: String,
                tempDir: URL, memory: @escaping @Sendable () -> UInt64, record: @escaping @Sendable (String) -> Void) {
        self.host = host
        self.platform = platform
        self.keys = keys
        self.algosJson = algosJson
        self.tempDir = tempDir
        self.memory = memory
        self.record = record
    }
}

public struct ScenarioResult {
    public let name: String
    public let ok: Bool
    public let error: String?
    /// Algorithm rows and PPK are reported, not required.
    public var required: Bool { !name.hasPrefix("algo.") && !name.hasSuffix(".ppk") }
}

func hexString(_ d: Data) -> String { d.map { String(format: "%02x", $0) }.joined() }

public func totp(_ secret: String, now: Date = Date()) -> String {
    let alpha = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")
    var bits = 0, value = 0
    var key = [UInt8]()
    for c in secret.trimmingCharacters(in: .whitespacesAndNewlines) {
        guard let i = alpha.firstIndex(of: c) else { continue }
        value = (value << 5) | i
        bits += 5
        if bits >= 8 {
            bits -= 8
            key.append(UInt8((value >> bits) & 0xff))
        }
    }
    var step = UInt64(now.timeIntervalSince1970 / 30).bigEndian
    var h = [UInt8](repeating: 0, count: 20)
    CCHmac(CCHmacAlgorithm(kCCHmacAlgSHA1), key, key.count, &step, 8, &h)
    let o = Int(h[19] & 0xf)
    let n = (UInt32(h[o] & 0x7f) << 24) | (UInt32(h[o + 1]) << 16) | (UInt32(h[o + 2]) << 8) | UInt32(h[o + 3])
    return String(format: "%06d", n % 1_000_000)
}

public final class TestCallbacks: SshCallbacks, @unchecked Sendable {
    let env: TestEnv
    let reject: Bool
    private let lock = NSLock()
    private var _rounds = [KbdRound]()
    private var _disconnects = [String]()
    public var rounds: [KbdRound] { lock.lock(); defer { lock.unlock() }; return _rounds }
    public var disconnects: [String] { lock.lock(); defer { lock.unlock() }; return _disconnects }

    public init(_ env: TestEnv, reject: Bool = false) {
        self.env = env
        self.reject = reject
    }

    public func verifyHostKey(_ key: HostKey) async -> Bool { !reject }

    public func keyboardInteractive(_ round: KbdRound) async -> [String]? {
        lock.lock(); _rounds.append(round); lock.unlock()
        return round.prompts.map { $0.prompt.lowercased().contains("verification") ? totp(env.keys("totp_secret")) : "termix-pass" }
    }

    public func onDisconnect(_ reason: String) {
        lock.lock(); _disconnects.append(reason); lock.unlock()
    }
}

public final class Collector: ShellSink, @unchecked Sendable {
    private let lock = NSLock()
    private var buf = Data()
    private var _exit: Int?
    private var _exited = false
    public var exited: Bool { lock.lock(); defer { lock.unlock() }; return _exited }
    public var exit: Int? { lock.lock(); defer { lock.unlock() }; return _exit }
    public init() {}
    public func onData(_ data: Data) { lock.lock(); buf.append(data); lock.unlock() }
    public func onExit(_ code: Int?) { lock.lock(); _exit = code; _exited = true; lock.unlock() }
    public func text() -> String { lock.lock(); defer { lock.unlock() }; return String(decoding: buf, as: UTF8.self) }
    public func waitFor(_ needle: String, secs: Double = 10) async -> Bool {
        let end = Date().addingTimeInterval(secs)
        while Date() < end {
            if text().contains(needle) { return true }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return false
    }
}

// MARK: - tiny blocking sockets for the forward checks

func tcpConnect(_ host: String, _ port: Int) -> Int32 {
    var hints = addrinfo(ai_flags: 0, ai_family: AF_INET, ai_socktype: SOCK_STREAM, ai_protocol: 0,
                         ai_addrlen: 0, ai_canonname: nil, ai_addr: nil, ai_next: nil)
    var res: UnsafeMutablePointer<addrinfo>?
    guard getaddrinfo(host, String(port), &hints, &res) == 0, let a = res else { return -1 }
    defer { freeaddrinfo(res) }
    let fd = socket(a.pointee.ai_family, a.pointee.ai_socktype, a.pointee.ai_protocol)
    var one: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
    if Darwin.connect(fd, a.pointee.ai_addr, a.pointee.ai_addrlen) != 0 { Darwin.close(fd); return -1 }
    return fd
}

func sendAll(_ fd: Int32, _ d: [UInt8]) { d.withUnsafeBytes { _ = Darwin.send(fd, $0.baseAddress, d.count, 0) } }

func recvExact(_ fd: Int32, _ n: Int) -> [UInt8] {
    var out = [UInt8](repeating: 0, count: n)
    var got = 0
    while got < n {
        let r = out.withUnsafeMutableBytes { Darwin.recv(fd, $0.baseAddress! + got, n - got, 0) }
        if r <= 0 { break }
        got += r
    }
    return Array(out[0..<got])
}

func recvAll(_ fd: Int32) -> String {
    var out = Data()
    var b = [UInt8](repeating: 0, count: 4096)
    while true {
        let r = b.withUnsafeMutableBytes { Darwin.recv(fd, $0.baseAddress, 4096, 0) }
        if r <= 0 { break }
        out.append(contentsOf: b[0..<r])
    }
    return String(decoding: out, as: UTF8.self)
}

/// A TCP relay the test can freeze, so packets stop with no FIN, like a phone losing signal.
public final class FreezableRelay: @unchecked Sendable {
    private let server: Int32
    public let port: Int
    private let lock = NSLock()
    private var _frozen = false
    private var fds = [Int32]()
    public var frozen: Bool {
        get { lock.lock(); defer { lock.unlock() }; return _frozen }
        set { lock.lock(); _frozen = newValue; lock.unlock() }
    }

    public init(target: String, port targetPort: Int) {
        server = socket(AF_INET, SOCK_STREAM, 0)
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        addr.sin_port = 0
        withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { _ = bind(server, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        listen(server, 8)
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        withUnsafeMutablePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { _ = getsockname(server, $0, &len) } }
        port = Int(UInt16(bigEndian: addr.sin_port))
        let srv = server
        Thread.detachNewThread { [weak self] in
            while true {
                let c = accept(srv, nil, nil)
                if c < 0 { break }
                let up = tcpConnect(target, targetPort)
                guard let self else { return }
                self.lock.lock(); self.fds += [c, up]; self.lock.unlock()
                self.pipe(c, up)
                self.pipe(up, c)
            }
        }
    }

    private func pipe(_ from: Int32, _ to: Int32) {
        Thread.detachNewThread { [weak self] in
            var b = [UInt8](repeating: 0, count: 65536)
            while true {
                let n = b.withUnsafeMutableBytes { Darwin.recv(from, $0.baseAddress, 65536, 0) }
                if n <= 0 { break }
                while self?.frozen == true { usleep(50_000) }
                _ = b.withUnsafeBytes { Darwin.send(to, $0.baseAddress, n, 0) }
            }
        }
    }

    public func close() {
        frozen = false
        Darwin.close(server)
        lock.lock(); fds.forEach { Darwin.shutdown($0, SHUT_RDWR); Darwin.close($0) }; lock.unlock()
    }
}

public func physFootprint() -> UInt64 {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let kr = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
    }
    return kr == KERN_SUCCESS ? info.phys_footprint : 0
}

// MARK: - scenarios

struct Check: Error, CustomStringConvertible {
    let description: String
}

func check(_ cond: Bool, _ msg: @autoclosure () -> String = "check failed") throws {
    if !cond { throw Check(description: msg()) }
}

public final class Scenarios {
    let engine: SshEngine
    let env: TestEnv

    public init(_ engine: SshEngine, _ env: TestEnv) {
        self.engine = engine
        self.env = env
    }

    func cfg(_ user: String, _ port: Int? = nil) -> SshConfig { SshConfig(host: env.host, port: port ?? env.targetPort, username: user) }
    func keyCfg(_ name: String = "id_ed25519") -> SshConfig { var c = cfg("key"); c.privateKey = env.keys(name); return c }
    func text(_ s: SshSession, _ cmd: String) async throws -> String {
        String(decoding: try await s.exec(cmd).stdout, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func expectFailure(_ kind: FailureKind, _ block: () async throws -> Void) async throws {
        do {
            try await block()
        } catch let e as SshFailure {
            try check(e.kind == kind, "expected \(kind), got \(e)")
            return
        }
        throw Check(description: "expected \(kind), but it worked")
    }

    func json(_ v: Any?) -> String {
        switch v {
        case nil: return "null"
        case let n as Double: return n.isFinite ? String(n) : "null"
        case let n as Int: return String(n)
        case let n as UInt64: return String(n)
        case let b as Bool: return b ? "true" : "false"
        case let m as [String: Any?]:
            return "{" + m.map { "\"\($0.key)\":\(json($0.value))" }.joined(separator: ",") + "}"
        default:
            return "\"" + "\(v!)".replacingOccurrences(of: "\\", with: "/").replacingOccurrences(of: "\"", with: "'")
                .replacingOccurrences(of: "\n", with: " ") + "\""
        }
    }

    func run(_ name: String, _ block: (inout [String: Any?]) async throws -> Void) async -> ScenarioResult {
        var detail = [String: Any?]()
        var err: String?
        do { try await block(&detail) } catch { err = "\(error)" }
        detail["error"] = err
        env.record("{\"engine\":\"\(engine.name)\",\"platform\":\"\(env.platform)\",\"scenario\":\"\(name)\",\"ok\":\(err == nil),\"detail\":\(json(detail))}")
        return ScenarioResult(name: name, ok: err == nil, error: err)
    }

    public func authPassword() async -> ScenarioResult {
        await run("auth.password") { _ in
            var c = cfg("pw"); c.password = "termix-pass"
            let s = try await engine.connect(c, TestCallbacks(env))
            try check(try await text(s, "whoami") == "pw")
            await s.close()
            c.password = "nope"
            let bad = c
            try await expectFailure(.auth) { _ = try await engine.connect(bad, TestCallbacks(env)) }
        }
    }

    public func authKey(_ name: String) async -> ScenarioResult {
        await run("auth.key.\(name)") { _ in try await engine.connect(keyCfg(name), TestCallbacks(env)).close() }
    }

    public func authKeyPassphrase() async -> ScenarioResult {
        await run("auth.key.passphrase") { _ in
            for name in ["id_ed25519_pass", "id_rsa_pass"] {
                var c = keyCfg(name)
                let plain = c
                try await expectFailure(.passphraseRequired) { _ = try await engine.connect(plain, TestCallbacks(env)) }
                c.passphrase = "wrong"
                let wrong = c
                try await expectFailure(.badPassphrase) { _ = try await engine.connect(wrong, TestCallbacks(env)) }
                c.passphrase = "termix-key"
                try await engine.connect(c, TestCallbacks(env)).close()
            }
        }
    }

    public func authKeyThenPassword() async -> ScenarioResult {
        await run("auth.key+password") { _ in
            var c = cfg("kp"); c.privateKey = env.keys("id_ed25519"); c.password = "termix-pass"
            try await engine.connect(c, TestCallbacks(env)).close()
        }
    }

    public func authKbd() async -> ScenarioResult {
        await run("auth.kbd") { d in
            let cb = TestCallbacks(env)
            try await engine.connect(cfg("kbd"), cb).close()
            let r = cb.rounds
            d["rounds"] = r.count
            try check(r.count == 2, "rounds \(r.count)")
            try check(r[1].prompts[0].prompt.lowercased().contains("verification"))
            try check(!r[0].prompts[0].echo, "password prompt must not echo")
        }
    }

    public func authCert() async -> ScenarioResult {
        await run("auth.cert") { _ in
            var c = cfg("cert"); c.privateKey = env.keys("id_cert")
            let plain = c
            if (try? await engine.connect(plain, TestCallbacks(env))) != nil { throw Check(description: "plain key must be refused") }
            c.certificate = env.keys("id_cert-cert.pub")
            try await engine.connect(c, TestCallbacks(env)).close()
        }
    }

    public func hostKey() async -> ScenarioResult {
        await run("hostkey") { d in
            var c = cfg("pw"); c.password = "termix-pass"
            let s = try await engine.connect(c, TestCallbacks(env))
            let k = s.hostKey
            d["type"] = k.keyType
            d["certificate"] = k.isCertificate
            d["algorithms"] = s.algorithms.joined(separator: " ")
            try check(k.sha256.hasPrefix("SHA256:"))
            let pub = env.keys("host_ed25519.pub").split(separator: " ")[1]
            if k.keyType.hasPrefix("ssh-ed25519") {
                try check(k.blobHex == hexString(Data(base64Encoded: String(pub))!), "blob \(k.blobHex)")
            }
            await s.close()
            let r = TestCallbacks(env, reject: true)
            let cc = c
            try await expectFailure(.hostkeyRejected) { _ = try await engine.connect(cc, r) }
            try check(r.rounds.isEmpty)
        }
    }

    public func shellAndExec() async -> ScenarioResult {
        await run("shell+exec") { _ in
            let s = try await engine.connect(keyCfg(), TestCallbacks(env))
            let out = Collector()
            let sh = try await s.openShell(term: "xterm-256color", cols: 80, rows: 24, env: ["LANG": "C.UTF-8"], sink: out)
            try await sh.write(Data("stty size; echo $TERM\n".utf8))
            try check(await out.waitFor("24 80"), out.text())
            try check(await out.waitFor("xterm-256color"))
            try await sh.resize(cols: 120, rows: 40)
            try await Task.sleep(nanoseconds: 200_000_000)
            try await sh.write(Data("stty size\n".utf8))
            try check(await out.waitFor("40 120"), out.text())
            try await sh.write(Data("exit 0\n".utf8))
            let end = Date().addingTimeInterval(5)
            while !out.exited && Date() < end { try await Task.sleep(nanoseconds: 50_000_000) }
            try check(out.exited && out.exit == 0, "exit \(String(describing: out.exit))")
            let r = try await s.exec("echo out; echo err >&2; exit 3")
            try check(String(decoding: r.stdout, as: UTF8.self) == "out\n" && String(decoding: r.stderr, as: UTF8.self) == "err\n" && r.exitCode == 3)
            await s.close()
        }
    }

    public func sftpBig() async -> ScenarioResult {
        await run("sftp.500mb") { d in
            let s = try await engine.connect(keyCfg(), TestCallbacks(env))
            let want = try await text(s, "cat /data/big.sha256")
            try check(try await s.list("/data").contains { $0.name == "big.bin" })
            let local = env.tempDir.appendingPathComponent("big.bin")
            let base = env.memory()
            let peak = Peak(base)
            let sampler = Task.detached { [env] in
                while !Task.isCancelled {
                    peak.update(env.memory())
                    try? await Task.sleep(nanoseconds: 50_000_000)
                }
            }
            let down = try await s.download("/data/big.bin", to: local.path, progress: nil)
            let up = try await s.upload(local.path, to: "/home/key/up.bin", progress: nil)
            sampler.cancel()
            var hasher = SHA256()
            let h = try FileHandle(forReadingFrom: local)
            while let chunk = try h.read(upToCount: 1 << 20), !chunk.isEmpty { hasher.update(data: chunk) }
            try h.close()
            try check(hexString(Data(hasher.finalize())) == want, "download hash")
            try check(try await text(s, "sha256sum /home/key/up.bin | cut -d' ' -f1") == want, "upload hash")
            try await s.remove("/home/key/up.bin")
            try? FileManager.default.removeItem(at: local)
            let mb = Double(down.bytes) / 1048576
            let growth = Double(peak.value - base) / 1048576
            d["mb"] = mb
            d["down_mbps"] = mb / (Double(max(down.millis, 1)) / 1000)
            d["up_mbps"] = Double(up.bytes) / 1048576 / (Double(max(up.millis, 1)) / 1000)
            d["peak_growth_mb"] = growth
            try check(growth < 64, "memory grew \(growth) MB")
            await s.close()
        }
    }

    public func forwards() async -> ScenarioResult {
        await run("forward.local+socks") { _ in
            let s = try await engine.connect(keyCfg(), TestCallbacks(env))
            let f = try await s.forwardLocal(bindPort: 0, host: "127.0.0.1", port: 7000)
            let port = f.port
            let echo: String = await Task.detached {
                let fd = tcpConnect("127.0.0.1", port)
                defer { Darwin.close(fd) }
                sendAll(fd, Array("ping\n".utf8))
                return String(decoding: recvExact(fd, 5), as: UTF8.self)
            }.value
            try check(echo == "ping\n", "echo \(echo)")
            f.close()
            let socks = try await s.forwardDynamic(bindPort: 0)
            let sp = socks.port
            let body: String = await Task.detached {
                let fd = tcpConnect("127.0.0.1", sp)
                defer { Darwin.close(fd) }
                sendAll(fd, [5, 1, 0])
                _ = recvExact(fd, 2)
                let name = Array("localhost".utf8)
                sendAll(fd, [5, 1, 0, 3, UInt8(name.count)] + name + [0x1f, 0x90])
                let rep = recvExact(fd, 10)
                if rep.count < 2 || rep[1] != 0 { return "socks reply \(rep)" }
                sendAll(fd, Array("GET /hello.txt HTTP/1.0\r\nHost: localhost\r\n\r\n".utf8))
                return recvAll(fd)
            }.value
            try check(body.contains("hello from termix"), body)
            socks.close()
            await s.close()
        }
    }

    public func jump() async -> ScenarioResult {
        await run("jump") { d in
            var j = cfg("key", env.jumpPort); j.privateKey = env.keys("id_ed25519")
            let js = try await engine.connect(j, TestCallbacks(env))
            let start = Date()
            let t = try await js.connectVia(SshConfig(host: env.jumpTarget, port: 22, username: "pw", password: "termix-pass"), TestCallbacks(env))
            d["hop_ms"] = Int(Date().timeIntervalSince(start) * 1000)
            try check(try await text(t, "test -f /data/big.bin && echo yes") == "yes")
            try check(!(try await t.list("/data")).isEmpty)
            await t.close()
            await js.close()
        }
    }

    public func keepaliveDrop() async -> ScenarioResult {
        await run("keepalive.drop") { d in
            let relay = FreezableRelay(target: env.host, port: env.targetPort)
            defer { relay.close() }
            let cb = TestCallbacks(env)
            var c = SshConfig(host: "127.0.0.1", port: relay.port, username: "key", privateKey: env.keys("id_ed25519"))
            c.keepaliveIntervalSecs = 2
            c.keepaliveCountMax = 2
            let s = try await engine.connect(c, cb)
            _ = try await s.openShell(term: "xterm", cols: 80, rows: 24, env: [:], sink: Collector())
            relay.frozen = true
            let start = Date()
            while cb.disconnects.isEmpty && Date().timeIntervalSince(start) < 30 { try await Task.sleep(nanoseconds: 100_000_000) }
            d["detect_s"] = Date().timeIntervalSince(start)
            d["reason"] = cb.disconnects.first
            try check(!cb.disconnects.isEmpty, "no disconnect in 30s")
            try check(s.isClosed)
            relay.frozen = false
            try await engine.connect(keyCfg(), TestCallbacks(env)).close()
        }
    }

    public func algorithms() async -> [ScenarioResult] {
        let re = try! NSRegularExpression(pattern: "\"id\":\\s*\"([^\"]+)\"[^}]*?\"legacy\":\\s*(true|false)[^}]*?\"port\":\\s*(\\d+)")
        let ns = env.algosJson as NSString
        var out = [ScenarioResult]()
        for m in re.matches(in: env.algosJson, range: NSRange(location: 0, length: ns.length)) {
            let id = ns.substring(with: m.range(at: 1))
            let legacy = ns.substring(with: m.range(at: 2)) == "true"
            let port = Int(ns.substring(with: m.range(at: 3)))!
            out.append(await run("algo.\(id)") { d in
                var c = cfg("pw", port); c.password = "termix-pass"; c.allowLegacyAlgorithms = true
                try await engine.connect(c, TestCallbacks(env)).close()
                if legacy {
                    c.allowLegacyAlgorithms = false
                    d["blocked_when_off"] = (try? await engine.connect(c, TestCallbacks(env))) == nil
                }
            })
        }
        return out
    }

    public func all() async -> [ScenarioResult] {
        var r = [ScenarioResult]()
        r.append(await authPassword())
        for k in ["id_ed25519", "id_rsa", "id_ecdsa256", "id_ecdsa384", "id_ecdsa521", "id_rsa.ppk", "id_ed25519.ppk"] { r.append(await authKey(k)) }
        r.append(await authKeyPassphrase())
        r.append(await authKeyThenPassword())
        r.append(await authKbd())
        r.append(await authCert())
        r.append(await hostKey())
        r.append(await shellAndExec())
        r.append(await sftpBig())
        r.append(await forwards())
        r.append(await jump())
        r.append(await keepaliveDrop())
        r += await algorithms()
        return r
    }
}

final class Peak: @unchecked Sendable {
    private let lock = NSLock()
    private var v: UInt64
    init(_ v: UInt64) { self.v = v }
    func update(_ x: UInt64) { lock.lock(); v = max(v, x); lock.unlock() }
    var value: UInt64 { lock.lock(); defer { lock.unlock() }; return v }
}
