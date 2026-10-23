import Foundation

/// One facade both engines implement, so the same scenarios run against each.
public protocol SshEngine: Sendable {
    var name: String { get }
    var version: String { get }
    func connect(_ config: SshConfig, _ callbacks: SshCallbacks) async throws -> SshSession
}

public struct SshConfig: Sendable {
    public var host: String
    public var port: Int
    public var username: String
    public var password: String?
    public var privateKey: String?
    public var passphrase: String?
    public var certificate: String?
    public var forceKeyboardInteractive = false
    public var allowLegacyAlgorithms = false
    public var connectTimeoutSecs = 10
    public var keepaliveIntervalSecs = 30
    public var keepaliveCountMax = 5

    public init(host: String, port: Int, username: String, password: String? = nil, privateKey: String? = nil) {
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.privateKey = privateKey
    }
}

public struct HostKey: Sendable {
    public let keyType: String
    public let blobHex: String
    public let sha256: String
    public let isCertificate: Bool
    public let caSha256: String?
    public let principals: [String]

    public init(keyType: String, blobHex: String, sha256: String, isCertificate: Bool, caSha256: String?, principals: [String]) {
        self.keyType = keyType
        self.blobHex = blobHex
        self.sha256 = sha256
        self.isCertificate = isCertificate
        self.caSha256 = caSha256
        self.principals = principals
    }
}

public struct KbdRound: Sendable {
    public let name: String
    public let instructions: String
    public let prompts: [(prompt: String, echo: Bool)]
    public let round: Int

    public init(name: String, instructions: String, prompts: [(prompt: String, echo: Bool)], round: Int) {
        self.name = name
        self.instructions = instructions
        self.prompts = prompts
        self.round = round
    }
}

public protocol SshCallbacks: AnyObject, Sendable {
    func verifyHostKey(_ key: HostKey) async -> Bool
    /// nil cancels the login.
    func keyboardInteractive(_ round: KbdRound) async -> [String]?
    func onDisconnect(_ reason: String)
}

public enum FailureKind: Int, Sendable {
    case connect = 1, hostkeyRejected, passphraseRequired, badPassphrase, invalidKey
    case auth, authCancelled, channel, sftp, io, disconnected
}

public struct SshFailure: Error, CustomStringConvertible {
    public let kind: FailureKind
    public let message: String
    public init(_ kind: FailureKind, _ message: String) {
        self.kind = kind
        self.message = message
    }
    public var description: String { "\(kind): \(message)" }
}

public struct ExecOut: Sendable {
    public let stdout: Data
    public let stderr: Data
    public let exitCode: Int?
    public init(stdout: Data, stderr: Data, exitCode: Int?) {
        self.stdout = stdout
        self.stderr = stderr
        self.exitCode = exitCode
    }
}

public struct RemoteFile: Sendable {
    public let name: String
    public let size: UInt64
    public let isDir: Bool
    public init(name: String, size: UInt64, isDir: Bool) {
        self.name = name
        self.size = size
        self.isDir = isDir
    }
}

public struct Transfer: Sendable {
    public let bytes: UInt64
    public let millis: UInt64
    public init(bytes: UInt64, millis: UInt64) {
        self.bytes = bytes
        self.millis = millis
    }
}

public protocol ShellSink: AnyObject, Sendable {
    func onData(_ data: Data)
    func onExit(_ code: Int?)
}

public protocol SshShell: Sendable {
    func write(_ data: Data) async throws
    func resize(cols: Int, rows: Int) async throws
    func close() async throws
}

public protocol SshForward: Sendable {
    var port: Int { get }
    func close()
}

public typealias Progress = @Sendable (UInt64, UInt64) -> Void

public protocol SshSession: AnyObject, Sendable {
    var hostKey: HostKey { get }
    var algorithms: [String] { get }
    var isClosed: Bool { get }
    func connectVia(_ config: SshConfig, _ callbacks: SshCallbacks) async throws -> SshSession
    func exec(_ command: String) async throws -> ExecOut
    func openShell(term: String, cols: Int, rows: Int, env: [String: String], sink: ShellSink) async throws -> SshShell
    func list(_ path: String) async throws -> [RemoteFile]
    func download(_ remote: String, to local: String, progress: Progress?) async throws -> Transfer
    func upload(_ local: String, to remote: String, progress: Progress?) async throws -> Transfer
    func remove(_ path: String) async throws
    func forwardLocal(bindPort: Int, host: String, port: Int) async throws -> SshForward
    func forwardDynamic(bindPort: Int) async throws -> SshForward
    func close() async
}
