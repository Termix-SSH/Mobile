package termix.ssh.api

/** One facade both engines implement, so the same scenarios run against each. */
interface SshEngine {
    val name: String
    val version: String
    suspend fun connect(config: SshConfig, callbacks: SshCallbacks): SshSession
}

data class SshConfig(
    val host: String,
    val port: Int,
    val username: String,
    val password: String? = null,
    val privateKey: String? = null,
    val passphrase: String? = null,
    val certificate: String? = null,
    val forceKeyboardInteractive: Boolean = false,
    val allowLegacyAlgorithms: Boolean = false,
    val connectTimeoutSecs: Int = 10,
    val keepaliveIntervalSecs: Int = 30,
    val keepaliveCountMax: Int = 5,
)

data class HostKey(
    val keyType: String,
    val blobHex: String,
    val sha256: String,
    val isCertificate: Boolean,
    val caSha256: String?,
    val principals: List<String>,
)

data class KbdRound(
    val name: String,
    val instructions: String,
    val prompts: List<Pair<String, Boolean>>,
    val round: Int,
)

interface SshCallbacks {
    suspend fun verifyHostKey(key: HostKey): Boolean
    /** Null cancels the login. */
    suspend fun keyboardInteractive(round: KbdRound): List<String>?
    fun onDisconnect(reason: String)
}

enum class FailureKind {
    CONNECT, HOSTKEY_REJECTED, PASSPHRASE_REQUIRED, BAD_PASSPHRASE, INVALID_KEY,
    AUTH, AUTH_CANCELLED, CHANNEL, SFTP, IO, DISCONNECTED,
}

class SshFailure(val kind: FailureKind, message: String) : Exception("$kind: $message")

class ExecOut(val stdout: ByteArray, val stderr: ByteArray, val exitCode: Int?)

data class RemoteFile(val name: String, val size: Long, val isDir: Boolean, val isSymlink: Boolean)

data class Transfer(val bytes: Long, val millis: Long)

interface ShellSink {
    fun onData(data: ByteArray)
    fun onExit(code: Int?)
}

interface SshShell {
    suspend fun write(data: ByteArray)
    suspend fun resize(cols: Int, rows: Int)
    suspend fun close()
}

interface SshForward {
    val port: Int
    fun close()
}

interface SshSession {
    val hostKey: HostKey
    /** kex, host key, cipher, mac */
    val algorithms: List<String>
    val isClosed: Boolean
    suspend fun connectVia(config: SshConfig, callbacks: SshCallbacks): SshSession
    suspend fun exec(command: String): ExecOut
    suspend fun openShell(term: String, cols: Int, rows: Int, env: Map<String, String>, sink: ShellSink): SshShell
    suspend fun list(path: String): List<RemoteFile>
    suspend fun download(remote: String, local: String, progress: ((Long, Long) -> Unit)? = null): Transfer
    suspend fun upload(local: String, remote: String, progress: ((Long, Long) -> Unit)? = null): Transfer
    suspend fun remove(path: String)
    suspend fun forwardLocal(bindPort: Int, host: String, port: Int): SshForward
    suspend fun forwardDynamic(bindPort: Int): SshForward
    suspend fun close()
}
