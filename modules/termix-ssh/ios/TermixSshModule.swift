import ExpoModulesCore
import Foundation
import TermixDisplay
import TermixPipe

// How long a login waits for the user to answer a host key or prompt.
private let promptTimeoutNs: UInt64 = 5 * 60 * 1_000_000_000

struct SshCodedException: CodedError {
  let code: String
  let description: String
  init(_ code: String, _ description: String) {
    self.code = code
    self.description = description
  }
}

private func coded(_ error: Error) -> Error {
  guard let e = error as? SshError else { return error }
  switch e {
  case let .Connect(msg): return SshCodedException("SSH_CONNECT", msg)
  case .HostKeyRejected: return SshCodedException("SSH_HOST_KEY_REJECTED", "Host key was rejected")
  case .PassphraseRequired: return SshCodedException("SSH_PASSPHRASE_REQUIRED", "The key needs a passphrase")
  case .BadPassphrase: return SshCodedException("SSH_BAD_PASSPHRASE", "Wrong passphrase")
  case let .InvalidKey(msg): return SshCodedException("SSH_INVALID_KEY", msg)
  case let .Auth(msg): return SshCodedException("SSH_AUTH", msg)
  case let .AuthMethodNotAvailable(msg): return SshCodedException("SSH_AUTH_METHOD_NOT_AVAILABLE", msg)
  case .AuthCancelled: return SshCodedException("SSH_AUTH_CANCELLED", "Login cancelled")
  case .Cancelled: return SshCodedException("SSH_CANCELLED", "Cancelled")
  case .Timeout: return SshCodedException("SSH_TIMEOUT", "Timed out")
  case let .Channel(msg): return SshCodedException("SSH_CHANNEL", msg)
  case let .Sftp(msg): return SshCodedException("SSH_SFTP", msg)
  case let .Io(msg): return SshCodedException("SSH_IO", msg)
  case .Disconnected: return SshCodedException("SSH_DISCONNECTED", "Disconnected")
  }
}

private func ssh<T>(_ block: () async throws -> T) async throws -> T {
  do { return try await block() } catch { throw coded(error) }
}

private func sshSync<T>(_ block: () throws -> T) throws -> T {
  do { return try block() } catch { throw coded(error) }
}

private func localPath(_ path: String) -> String {
  path.hasPrefix("file://") ? (URL(string: path)?.path ?? String(path.dropFirst(7))) : path
}

private func num(_ v: Any?, _ fallback: Int) -> Int { (v as? NSNumber)?.intValue ?? fallback }

private func parseProxies(_ c: [String: Any]) -> [ProxyHop] {
  (c["proxies"] as? [[String: Any]] ?? []).map { p -> ProxyHop in
    let kind: ProxyKind = p["kind"] as? String == "socks4" ? .socks4 : p["kind"] as? String == "http" ? .http : .socks5
    return ProxyHop(
      kind: kind, host: p["host"] as? String ?? "", port: UInt16(num(p["port"], 1080)),
      username: p["username"] as? String, password: p["password"] as? String)
  }
}

private func parseDial(_ c: [String: Any]) throws -> DialConfig {
  guard let host = c["host"] as? String else { throw SshCodedException("SSH_CONNECT", "No host") }
  return DialConfig(
    host: host, port: UInt16(num(c["port"], 23)), proxies: parseProxies(c),
    connectTimeoutSecs: UInt32(num(c["connectTimeoutSecs"], 15)))
}

private func parseDisplay(_ c: [String: Any]) throws -> DisplayConfig {
  DisplayConfig(
    dial: try parseDial(c),
    protocol: c["protocol"] as? String == "rdp" ? .rdp : .vnc,
    username: c["username"] as? String,
    password: c["password"] as? String,
    domain: c["domain"] as? String,
    width: UInt32(num(c["width"], 1280)),
    height: UInt32(num(c["height"], 720)),
    scale: UInt32(num(c["scale"], 0)),
    security: c["security"] as? String ?? "",
    serverCert: c["serverCert"] as? String)
}

private func parseConfig(_ c: [String: Any]) throws -> ConnectConfig {
  guard let host = c["host"] as? String else { throw SshCodedException("SSH_CONNECT", "No host") }
  let proxies = parseProxies(c)
  let knocks = (c["portKnock"] as? [[String: Any]] ?? []).map {
    PortKnock(port: UInt16(num($0["port"], 0)), udp: $0["udp"] as? Bool ?? false, delayMs: UInt32(num($0["delayMs"], 100)))
  }
  return ConnectConfig(
    host: host,
    port: UInt16(num(c["port"], 22)),
    username: c["username"] as? String ?? "",
    password: c["password"] as? String,
    privateKey: c["privateKey"] as? String,
    passphrase: c["passphrase"] as? String,
    certificate: c["certificate"] as? String,
    forceKeyboardInteractive: c["forceKeyboardInteractive"] as? Bool ?? false,
    tryKeyboard: c["tryKeyboard"] as? Bool ?? true,
    allowLegacyAlgorithms: c["allowLegacyAlgorithms"] as? Bool ?? true,
    connectTimeoutSecs: UInt32(num(c["connectTimeoutSecs"], 15)),
    keepaliveIntervalSecs: UInt32(num(c["keepaliveIntervalSecs"], 30)),
    keepaliveCountMax: UInt32(num(c["keepaliveCountMax"], 5)),
    proxies: proxies,
    portKnock: knocks
  )
}

private func hostKeyMap(_ k: HostKeyInfo) -> [String: Any?] {
  [
    "host": k.host, "port": Int(k.port), "keyType": k.keyType, "blobHex": k.blobHex, "sha256": k.sha256,
    "isCertificate": k.isCertificate, "caSha256": k.caSha256, "principals": k.principals,
  ]
}

private func entryMap(_ e: FileEntry) -> [String: Any?] {
  [
    "name": e.name, "size": Double(e.size), "isDir": e.isDir, "isSymlink": e.isSymlink,
    "permissions": Int(e.permissions), "mtime": Double(e.mtime), "atime": Double(e.atime),
    "uid": e.uid.map { Int($0) }, "gid": e.gid.map { Int($0) }, "linkTarget": e.linkTarget,
  ]
}

private func sessionInfo(_ s: Session) -> [String: Any?] {
  let a = s.algorithms()
  return [
    "hostKey": hostKeyMap(s.hostKey()),
    "algorithms": a.map { ["kex": $0.kex, "hostKey": $0.hostKey, "cipher": $0.cipher, "mac": $0.mac] },
  ]
}

private func label(_ k: DisconnectKind) -> String {
  switch k {
  case .server: return "server"
  case .keepalive: return "keepalive"
  case .network: return "network"
  case .local: return "local"
  }
}

/// A one shot answer the JS side gives while a login waits.
private final class Answer<T>: @unchecked Sendable {
  let sessionId: String
  private let lock = NSLock()
  private var value: T?
  private var waiter: CheckedContinuation<T?, Never>?
  private var done = false

  init(_ sessionId: String) { self.sessionId = sessionId }

  func complete(_ v: T?) {
    lock.lock()
    guard !done else { lock.unlock(); return }
    done = true
    value = v
    let w = waiter
    waiter = nil
    lock.unlock()
    w?.resume(returning: v)
  }

  func wait() async -> T? {
    let timeout = Task { [weak self] in
      try? await Task.sleep(nanoseconds: promptTimeoutNs)
      self?.complete(nil)
    }
    defer { timeout.cancel() }
    return await withCheckedContinuation { c in
      lock.lock()
      if done {
        lock.unlock()
        c.resume(returning: value)
      } else {
        waiter = c
        lock.unlock()
      }
    }
  }
}

private final class Live: @unchecked Sendable {
  let session: Session
  var sftp: Sftp?
  init(_ s: Session) { session = s }
}

/// A channel object plus the session it belongs to, so a dropped session can clean up after itself.
private struct Owned<T> {
  let sessionId: String
  let value: T
}

/// Thread safe dictionary, since UniFFI calls back from Rust threads.
private final class Store<V>: @unchecked Sendable {
  private let lock = NSLock()
  private var items = [String: V]()
  subscript(key: String) -> V? {
    get { lock.lock(); defer { lock.unlock() }; return items[key] }
    set { lock.lock(); items[key] = newValue; lock.unlock() }
  }
  func remove(_ key: String) -> V? { lock.lock(); defer { lock.unlock() }; return items.removeValue(forKey: key) }
  func removeAll() -> [V] { lock.lock(); defer { lock.unlock() }; let v = Array(items.values); items.removeAll(); return v }
  func removeWhere(_ test: (V) -> Bool) -> [V] {
    lock.lock()
    defer { lock.unlock() }
    let keys = items.filter { test($0.value) }.map { $0.key }
    return keys.compactMap { items.removeValue(forKey: $0) }
  }
  func values() -> [V] { lock.lock(); defer { lock.unlock() }; return Array(items.values) }
}

private final class Callbacks: SessionCallbacks, @unchecked Sendable {
  let id: String
  weak var module: TermixSshModule?
  init(_ id: String, _ module: TermixSshModule) {
    self.id = id
    self.module = module
  }

  func verifyHostKey(info: HostKeyInfo) async -> Bool {
    guard let module else { return false }
    let requestId = module.nextRequestId("hk")
    let answer = Answer<Bool>(id)
    module.hostKeyAnswers[requestId] = answer
    defer { _ = module.hostKeyAnswers.remove(requestId) }
    module.sendEvent("onHostKey", ["sessionId": id, "requestId": requestId, "hostKey": hostKeyMap(info)])
    return await answer.wait() ?? false
  }

  func keyboardInteractive(request: KbdRequest) async -> [String]? {
    guard let module else { return nil }
    let requestId = module.nextRequestId("kb")
    let answer = Answer<[String]>(id)
    module.kbdAnswers[requestId] = answer
    defer { _ = module.kbdAnswers.remove(requestId) }
    module.sendEvent("onKeyboardInteractive", [
      "sessionId": id,
      "requestId": requestId,
      "request": [
        "name": request.name,
        "instructions": request.instructions,
        "prompts": request.prompts.map { ["prompt": $0.prompt, "echo": $0.echo] },
        "round": Int(request.round),
      ],
    ])
    return await answer.wait()
  }

  func onBanner(banner: String) { module?.sendEvent("onBanner", ["sessionId": id, "banner": banner]) }

  func onDisconnect(kind: DisconnectKind, reason: String) {
    module?.dropChannels(id)
    module?.sendEvent("onDisconnect", ["sessionId": id, "kind": label(kind), "reason": reason])
  }
}

private final class ShellSink: ShellCallbacks, @unchecked Sendable {
  let shellId: String
  weak var module: TermixSshModule?
  // With a pipe the bytes go straight to the terminal view; JS only hears that output started.
  let pipeId: String?
  let pipe: BytePipe?
  private var announced = false
  init(_ shellId: String, _ module: TermixSshModule, pipeId: String?) {
    self.shellId = shellId
    self.module = module
    self.pipeId = pipeId
    self.pipe = pipeId.map { TermixPipes.get($0) }
  }
  func onData(data: Data) {
    guard let pipe else {
      module?.sendEvent("onShellData", ["shellId": shellId, "data": data.base64EncodedString()])
      return
    }
    pipe.push(data)
    if !announced {
      announced = true
      module?.sendEvent("onShellActive", ["shellId": shellId])
    }
  }
  func onExit(exitCode: UInt32?, exitSignal: String?) {
    _ = module?.shells.remove(shellId)
    _ = module?.telnets.remove(shellId)
    let producer = module?.producers.remove(shellId)
    if let pipe, let pipeId {
      if let producer { pipe.detachProducer(producer) }
      TermixPipes.release(pipeId)
    }
    module?.sendEvent("onShellExit", [
      "shellId": shellId, "exitCode": exitCode.map { Int($0) } as Any, "exitSignal": exitSignal as Any,
    ])
  }
}

/// Pauses the Rust reader while the terminal view catches up.
private final class ShellProducer: PipeProducer, @unchecked Sendable {
  private let onPause: () -> Void
  private let onResume: () -> Void
  init(_ shell: Shell) {
    onPause = { shell.pause() }
    onResume = { shell.resume() }
  }
  init(_ telnet: TelnetShell) {
    onPause = { telnet.pause() }
    onResume = { telnet.resume() }
  }
  func pause() { onPause() }
  func resume() { onResume() }
}

/// Frames go straight into the display view's buffer; JS only hears size, clipboard and the end.
private final class DisplaySink: DisplayCallbacks, @unchecked Sendable {
  let displayId: String
  weak var module: TermixSshModule?
  let frame: FrameBuffer
  init(_ displayId: String, _ module: TermixSshModule) {
    self.displayId = displayId
    self.module = module
    frame = TermixFrames.get(displayId)
  }
  func onResize(width: UInt32, height: UInt32) {
    frame.resize(width: Int(width), height: Int(height))
    module?.sendEvent("onDisplayResize", ["displayId": displayId, "width": Int(width), "height": Int(height)])
  }
  func onFrame(x: UInt32, y: UInt32, width: UInt32, height: UInt32, rgba: Data) {
    frame.blit(x: Int(x), y: Int(y), width: Int(width), height: Int(height), rgba: rgba)
  }
  func onClipboard(text: String) {
    module?.sendEvent("onDisplayClipboard", ["displayId": displayId, "text": text])
  }
  func onClosed(reason: String?) {
    _ = module?.displays.remove(displayId)
    TermixFrames.release(displayId)
    module?.sendEvent("onDisplayClosed", ["displayId": displayId, "reason": reason as Any])
  }
}

private final class ExecSink: ExecCallbacks, @unchecked Sendable {
  let execId: String
  weak var module: TermixSshModule?
  init(_ execId: String, _ module: TermixSshModule) {
    self.execId = execId
    self.module = module
  }
  func onStdout(data: Data) {
    module?.sendEvent("onExecData", ["execId": execId, "stream": "stdout", "data": data.base64EncodedString()])
  }
  func onStderr(data: Data) {
    module?.sendEvent("onExecData", ["execId": execId, "stream": "stderr", "data": data.base64EncodedString()])
  }
  func onExit(exitCode: UInt32?, exitSignal: String?) {
    _ = module?.execs.remove(execId)
    module?.sendEvent("onExecExit", [
      "execId": execId, "exitCode": exitCode.map { Int($0) } as Any, "exitSignal": exitSignal as Any,
    ])
  }
}

private final class OpProgress: ProgressCallback, @unchecked Sendable {
  let opId: String
  weak var module: TermixSshModule?
  init(_ opId: String, _ module: TermixSshModule) {
    self.opId = opId
    self.module = module
  }
  func onProgress(done: UInt64, total: UInt64) {
    module?.sendEvent("onProgress", ["opId": opId, "done": Double(done), "total": Double(total)])
  }
}

public final class TermixSshModule: Module {
  fileprivate let sessions = Store<Live>()
  fileprivate let shells = Store<Owned<Shell>>()
  fileprivate let telnets = Store<Owned<TelnetShell>>()
  fileprivate let displays = Store<Owned<RemoteDisplay>>()
  // The pipe holds its producer weakly, so the module keeps it.
  fileprivate let producers = Store<ShellProducer>()
  fileprivate let execs = Store<Owned<ExecHandle>>()
  fileprivate let forwards = Store<Owned<Forward>>()
  fileprivate let cancels = Store<CancelToken>()
  fileprivate let hostKeyAnswers = Store<Answer<Bool>>()
  fileprivate let kbdAnswers = Store<Answer<[String]>>()
  private let counterLock = NSLock()
  private var counter = 0

  fileprivate func nextRequestId(_ prefix: String) -> String {
    counterLock.lock()
    defer { counterLock.unlock() }
    counter += 1
    return "\(prefix)\(counter)"
  }

  private func live(_ id: String) throws -> Live {
    guard let l = sessions[id] else { throw SshCodedException("SSH_DISCONNECTED", "No session \(id)") }
    return l
  }

  private func sftp(_ id: String) async throws -> Sftp {
    let l = try live(id)
    if let s = l.sftp { return s }
    let s = try await ssh { try await l.session.openSftp() }
    l.sftp = s
    return s
  }

  // Runs a cancellable call; `cancel(opId)` from JS fires the token.
  private func withCancel<T>(_ opId: String, _ block: (CancelToken) async throws -> T) async throws -> T {
    let token = CancelToken()
    cancels[opId] = token
    defer { _ = cancels.remove(opId) }
    return try await ssh { try await block(token) }
  }

  // The server dropped the session: close its channels but keep the record so JS can reconnect.
  fileprivate func dropChannels(_ sessionId: String) {
    sessions[sessionId]?.sftp = nil
    _ = shells.removeWhere { $0.sessionId == sessionId }
    _ = telnets.removeWhere { $0.sessionId == sessionId }
    displays.removeWhere { $0.sessionId == sessionId }.forEach { $0.value.stop() }
    _ = execs.removeWhere { $0.sessionId == sessionId }
    forwards.removeWhere { $0.sessionId == sessionId }.forEach { $0.value.stop() }
  }

  public func definition() -> ModuleDefinition {
    Name("TermixSsh")

    Events(
      "onHostKey", "onKeyboardInteractive", "onBanner", "onDisconnect",
      "onShellData", "onShellActive", "onShellExit", "onExecData", "onExecExit", "onProgress",
      "onDisplayResize", "onDisplayClipboard", "onDisplayClosed"
    )

    Function("engineVersion") { engineVersion() }

    AsyncFunction("connect") { (id: String, c: [String: Any], parentId: String?) async throws -> [String: Any?] in
      let config = try parseConfig(c)
      let cb = Callbacks(id, self)
      let session = try await self.withCancel(id) { token in
        if let parentId {
          return try await self.live(parentId).session.connectVia(config: config, callbacks: cb, cancel: token)
        }
        return try await connect(config: config, callbacks: cb, cancel: token)
      }
      self.sessions[id] = Live(session)
      return sessionInfo(session)
    }

    AsyncFunction("reconnect") { (id: String) async throws -> [String: Any?] in
      let old = try self.live(id)
      let fresh = try await self.withCancel(id) { token in try await old.session.reconnect(cancel: token) }
      self.sessions[id] = Live(fresh)
      self.dropChannels(id)
      return sessionInfo(fresh)
    }

    Function("cancel") { (opId: String) in
      self.cancels[opId]?.cancel()
      // A login waiting on the user gives up right away.
      self.hostKeyAnswers.values().filter { $0.sessionId == opId }.forEach { $0.complete(false) }
      self.kbdAnswers.values().filter { $0.sessionId == opId }.forEach { $0.complete(nil) }
    }

    Function("answerHostKey") { (requestId: String, accept: Bool) in self.hostKeyAnswers[requestId]?.complete(accept) }

    Function("answerKeyboardInteractive") { (requestId: String, answers: [String]?) in
      self.kbdAnswers[requestId]?.complete(answers)
    }

    Function("isClosed") { (id: String) -> Bool in self.sessions[id]?.session.isClosed() ?? true }

    AsyncFunction("ping") { (id: String, timeoutSecs: Int) async throws in
      try await ssh { try await self.live(id).session.ping(timeoutSecs: UInt32(timeoutSecs)) }
    }

    AsyncFunction("disconnect") { (id: String) async in
      guard let l = self.sessions.remove(id) else { return }
      self.dropChannels(id)
      try? await l.session.disconnect()
    }

    AsyncFunction("exec") { (id: String, opId: String, command: String, timeoutSecs: Int, maxBytes: Double) async throws -> [String: Any?] in
      let s = try self.live(id).session
      let r = try await self.withCancel(opId) { token in
        try await s.exec(command: command, timeoutSecs: UInt32(timeoutSecs), maxBytes: UInt64(maxBytes), cancel: token)
      }
      return [
        "stdout": r.stdout.base64EncodedString(), "stderr": r.stderr.base64EncodedString(),
        "exitCode": r.exitCode.map { Int($0) }, "exitSignal": r.exitSignal, "truncated": r.truncated,
      ]
    }

    AsyncFunction("execStream") { (id: String, execId: String, command: String, pty: [String: Any]?) async throws in
      let size = pty.map {
        PtySize(term: $0["term"] as? String ?? "xterm-256color", cols: UInt32(num($0["cols"], 80)), rows: UInt32(num($0["rows"], 24)))
      }
      let h = try await ssh {
        try await self.live(id).session.execStream(command: command, pty: size, callbacks: ExecSink(execId, self))
      }
      self.execs[execId] = Owned(sessionId: id, value: h)
    }

    AsyncFunction("execWrite") { (execId: String, data: String) async throws in
      guard let h = self.execs[execId]?.value else { throw SshCodedException("SSH_DISCONNECTED", "Command ended") }
      try await ssh { try await h.write(data: Data(base64Encoded: data) ?? Data()) }
    }

    AsyncFunction("execEof") { (execId: String) async throws in
      guard let h = self.execs[execId]?.value else { return }
      try await ssh { try await h.eof() }
    }

    AsyncFunction("execSignal") { (execId: String, name: String) async throws in
      guard let h = self.execs[execId]?.value else { return }
      try await ssh { try await h.signal(name: name) }
    }

    AsyncFunction("execClose") { (execId: String) async in
      try? await self.execs[execId]?.value.end()
    }

    AsyncFunction("openShell") { (id: String, shellId: String, term: String, cols: Int, rows: Int, env: [String: String], pipeId: String?) async throws in
      let sink = ShellSink(shellId, self, pipeId: pipeId)
      let shell = try await ssh {
        try await self.live(id).session.openShell(
          term: term, cols: UInt32(cols), rows: UInt32(rows),
          env: env.map { EnvVar(name: $0.key, value: $0.value) }, callbacks: sink)
      }
      self.shells[shellId] = Owned(sessionId: id, value: shell)
      if let pipe = sink.pipe {
        let producer = ShellProducer(shell)
        self.producers[shellId] = producer
        pipe.setProducer(producer)
      }
    }

    // Telnet shells use the same write, resize and close calls as SSH shells.
    AsyncFunction("openTelnet") {
      (shellId: String, dial: [String: Any], term: String, cols: Int, rows: Int, login: [String: String], viaId: String?, pipeId: String?) async throws in
      let config = TelnetConfig(
        dial: try parseDial(dial), term: term, cols: UInt32(cols), rows: UInt32(rows),
        username: login["username"], password: login["password"])
      let via = try viaId.map { try self.live($0).session }
      let sink = ShellSink(shellId, self, pipeId: pipeId)
      let shell = try await ssh { try await connectTelnet(config: config, via: via, callbacks: sink) }
      self.telnets[shellId] = Owned(sessionId: viaId ?? "", value: shell)
      if let pipe = sink.pipe {
        let producer = ShellProducer(shell)
        self.producers[shellId] = producer
        pipe.setProducer(producer)
      }
    }

    AsyncFunction("writeShell") { (shellId: String, data: String) async throws in
      let bytes = Data(base64Encoded: data) ?? Data()
      if let telnet = self.telnets[shellId]?.value {
        try await ssh { try await telnet.write(data: bytes) }
        return
      }
      guard let shell = self.shells[shellId]?.value else { throw SshCodedException("SSH_DISCONNECTED", "Shell closed") }
      try await ssh { try await shell.write(data: bytes) }
    }

    AsyncFunction("resizeShell") { (shellId: String, cols: Int, rows: Int) async throws in
      if let telnet = self.telnets[shellId]?.value {
        try await ssh { try await telnet.resize(cols: UInt32(cols), rows: UInt32(rows)) }
        return
      }
      guard let shell = self.shells[shellId]?.value else { return }
      try await ssh { try await shell.resize(cols: UInt32(cols), rows: UInt32(rows)) }
    }

    AsyncFunction("signalShell") { (shellId: String, name: String) async throws in
      guard let shell = self.shells[shellId]?.value else { return }
      try await ssh { try await shell.signal(name: name) }
    }

    AsyncFunction("closeShell") { (shellId: String) async in
      try? await self.shells[shellId]?.value.end()
      try? await self.telnets[shellId]?.value.end()
    }

    Function("displayProtocols") { displayProtocols().map { $0 == .rdp ? "rdp" : "vnc" } }

    AsyncFunction("openDisplay") { (displayId: String, c: [String: Any], viaId: String?) async throws in
      let config = try parseDisplay(c)
      let via = try viaId.map { try self.live($0).session }
      let display = try await ssh {
        try await openDisplay(config: config, via: via, callbacks: DisplaySink(displayId, self))
      }
      self.displays[displayId] = Owned(sessionId: viaId ?? "", value: display)
    }

    Function("displayPointer") { (displayId: String, x: Int, y: Int, buttons: Int) in
      self.displays[displayId]?.value.pointer(x: UInt32(max(0, x)), y: UInt32(max(0, y)), buttons: UInt8(buttons & 0xff))
    }

    Function("displayKeySym") { (displayId: String, sym: Int, down: Bool) in
      self.displays[displayId]?.value.keySym(sym: UInt32(sym), down: down)
    }

    Function("displayUnicode") { (displayId: String, ch: Int, down: Bool) in
      self.displays[displayId]?.value.unicode(ch: UInt32(ch), down: down)
    }

    Function("displayClipboard") { (displayId: String, text: String) in
      self.displays[displayId]?.value.clipboardSet(text: text)
    }

    Function("displayResize") { (displayId: String, width: Int, height: Int, scale: Int) in
      self.displays[displayId]?.value.resize(width: UInt32(width), height: UInt32(height), scale: UInt32(scale))
    }

    Function("displayRefresh") { (displayId: String) in self.displays[displayId]?.value.refresh() }

    Function("closeDisplay") { (displayId: String) in
      self.displays.remove(displayId)?.value.stop()
    }

    AsyncFunction("sftpList") { (id: String, path: String) async throws -> [[String: Any?]] in
      try await ssh { try await self.sftp(id).list(path: path) }.map(entryMap)
    }

    AsyncFunction("sftpStat") { (id: String, path: String) async throws -> [String: Any?] in
      entryMap(try await ssh { try await self.sftp(id).stat(path: path) })
    }

    AsyncFunction("sftpLstat") { (id: String, path: String) async throws -> [String: Any?] in
      entryMap(try await ssh { try await self.sftp(id).lstat(path: path) })
    }

    AsyncFunction("sftpSize") { (id: String, path: String) async throws -> Double in
      Double(try await ssh { try await self.sftp(id).size(path: path) })
    }

    AsyncFunction("sftpRealpath") { (id: String, path: String) async throws -> String in
      try await ssh { try await self.sftp(id).realpath(path: path) }
    }

    AsyncFunction("sftpReadLink") { (id: String, path: String) async throws -> String in
      try await ssh { try await self.sftp(id).readLink(path: path) }
    }

    AsyncFunction("sftpSymlink") { (id: String, path: String, target: String) async throws in
      try await ssh { try await self.sftp(id).symlink(path: path, target: target) }
    }

    AsyncFunction("sftpMkdir") { (id: String, path: String, mode: Int?) async throws in
      try await ssh { try await self.sftp(id).mkdir(path: path, mode: mode.map { UInt32($0) }) }
    }

    AsyncFunction("sftpRmdir") { (id: String, path: String) async throws in
      try await ssh { try await self.sftp(id).rmdir(path: path) }
    }

    AsyncFunction("sftpRename") { (id: String, from: String, to: String) async throws in
      try await ssh { try await self.sftp(id).rename(from: from, to: to) }
    }

    AsyncFunction("sftpChmod") { (id: String, path: String, mode: Int) async throws in
      try await ssh { try await self.sftp(id).chmod(path: path, mode: UInt32(mode)) }
    }

    AsyncFunction("sftpRemove") { (id: String, path: String) async throws in
      try await ssh { try await self.sftp(id).remove(path: path) }
    }

    AsyncFunction("sftpRemoveRecursive") { (id: String, opId: String, path: String) async throws -> Double in
      let s = try await self.sftp(id)
      return Double(try await self.withCancel(opId) { token in
        try await s.removeRecursive(path: path, progress: OpProgress(opId, self), cancel: token)
      })
    }

    AsyncFunction("sftpReadFile") { (id: String, path: String, maxBytes: Double) async throws -> String in
      try await ssh { try await self.sftp(id).readFile(path: path, maxBytes: UInt64(maxBytes)) }.base64EncodedString()
    }

    AsyncFunction("sftpWriteFile") { (id: String, path: String, data: String, mode: Int?) async throws in
      try await ssh {
        try await self.sftp(id).writeFile(path: path, data: Data(base64Encoded: data) ?? Data(), mode: mode.map { UInt32($0) })
      }
    }

    AsyncFunction("sftpDownload") { (id: String, opId: String, remote: String, local: String, offset: Double) async throws -> [String: Double] in
      let s = try await self.sftp(id)
      let r = try await self.withCancel(opId) { token in
        try await s.download(
          remote: remote, local: localPath(local), offset: UInt64(offset), progress: OpProgress(opId, self), cancel: token)
      }
      return ["bytes": Double(r.bytes), "millis": Double(r.millis)]
    }

    AsyncFunction("sftpUpload") { (id: String, opId: String, local: String, remote: String, offset: Double) async throws -> [String: Double] in
      let s = try await self.sftp(id)
      let r = try await self.withCancel(opId) { token in
        try await s.upload(
          local: localPath(local), remote: remote, offset: UInt64(offset), progress: OpProgress(opId, self), cancel: token)
      }
      return ["bytes": Double(r.bytes), "millis": Double(r.millis)]
    }

    AsyncFunction("forwardLocal") { (id: String, forwardId: String, bindHost: String, bindPort: Int, host: String, port: Int) async throws -> Int in
      let f = try await ssh {
        try await self.live(id).session.forwardLocal(
          bindHost: bindHost, bindPort: UInt16(bindPort), remoteHost: host, remotePort: UInt16(port))
      }
      self.forwards[forwardId] = Owned(sessionId: id, value: f)
      return Int(f.port())
    }

    AsyncFunction("forwardDynamic") { (id: String, forwardId: String, bindHost: String, bindPort: Int) async throws -> Int in
      let f = try await ssh { try await self.live(id).session.forwardDynamic(bindHost: bindHost, bindPort: UInt16(bindPort)) }
      self.forwards[forwardId] = Owned(sessionId: id, value: f)
      return Int(f.port())
    }

    AsyncFunction("forwardRemote") { (id: String, forwardId: String, remoteHost: String, remotePort: Int, localHost: String, localPort: Int) async throws -> Int in
      let f = try await ssh {
        try await self.live(id).session.forwardRemote(
          remoteBindHost: remoteHost, remotePort: UInt16(remotePort), localHost: localHost, localPort: UInt16(localPort))
      }
      self.forwards[forwardId] = Owned(sessionId: id, value: f)
      return Int(f.port())
    }

    AsyncFunction("closeForward") { (forwardId: String) async in
      guard let f = self.forwards.remove(forwardId)?.value else { return }
      try? await f.shutdown()
    }

    Function("inspectKey") { (text: String, passphrase: String?) throws -> [String: Any] in
      let k = try sshSync { try inspectKey(text: text, passphrase: passphrase) }
      return [
        "keyType": k.keyType, "bits": Int(k.bits), "sha256": k.sha256, "publicOpenssh": k.publicOpenssh,
        "encrypted": k.encrypted, "format": k.format, "comment": k.comment,
      ]
    }

    Function("convertKeyToOpenssh") { (text: String, passphrase: String?, newPassphrase: String?) throws -> String in
      try sshSync { try convertKeyToOpenssh(text: text, passphrase: passphrase, newPassphrase: newPassphrase) }
    }

    Function("inspectCertificate") { (text: String) throws -> [String: Any] in
      let c = try sshSync { try inspectCertificate(text: text) }
      return [
        "keyType": c.keyType, "keyId": c.keyId, "serial": Double(c.serial), "principals": c.principals,
        "validAfter": Double(c.validAfter), "validBefore": Double(c.validBefore), "caSha256": c.caSha256, "isHost": c.isHost,
      ]
    }

    OnDestroy {
      self.cancels.removeAll().forEach { $0.cancel() }
      self.forwards.removeAll().forEach { $0.value.stop() }
      _ = self.execs.removeAll()
      _ = self.shells.removeAll()
      _ = self.telnets.removeAll()
      self.displays.removeAll().forEach { $0.value.stop() }
      _ = self.producers.removeAll()
      _ = self.sessions.removeAll()
    }
  }
}
