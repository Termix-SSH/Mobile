package termix.ssh.russh

import termix.ssh.api.*
import uniffi.termix_ssh_core.ConnectConfig
import uniffi.termix_ssh_core.EnvVar
import uniffi.termix_ssh_core.HostKeyInfo
import uniffi.termix_ssh_core.KbdRequest
import uniffi.termix_ssh_core.ProgressCallback
import uniffi.termix_ssh_core.Session
import uniffi.termix_ssh_core.SessionCallbacks
import uniffi.termix_ssh_core.ShellCallbacks
import uniffi.termix_ssh_core.SshException
import uniffi.termix_ssh_core.engineVersion

private fun SshConfig.toFfi() = ConnectConfig(
    host = host,
    port = port.toUShort(),
    username = username,
    password = password,
    privateKey = privateKey,
    passphrase = passphrase,
    certificate = certificate,
    forceKeyboardInteractive = forceKeyboardInteractive,
    allowLegacyAlgorithms = allowLegacyAlgorithms,
    connectTimeoutSecs = connectTimeoutSecs.toUInt(),
    keepaliveIntervalSecs = keepaliveIntervalSecs.toUInt(),
    keepaliveCountMax = keepaliveCountMax.toUInt(),
)

private fun HostKeyInfo.toApi() = HostKey(keyType, blobHex, sha256, isCertificate, caSha256, principals)

private fun SshException.toFailure(): SshFailure = when (this) {
    is SshException.Connect -> SshFailure(FailureKind.CONNECT, msg)
    is SshException.HostKeyRejected -> SshFailure(FailureKind.HOSTKEY_REJECTED, "rejected")
    is SshException.PassphraseRequired -> SshFailure(FailureKind.PASSPHRASE_REQUIRED, "needs passphrase")
    is SshException.BadPassphrase -> SshFailure(FailureKind.BAD_PASSPHRASE, "wrong passphrase")
    is SshException.InvalidKey -> SshFailure(FailureKind.INVALID_KEY, msg)
    is SshException.Auth -> SshFailure(FailureKind.AUTH, msg)
    is SshException.AuthCancelled -> SshFailure(FailureKind.AUTH_CANCELLED, "cancelled")
    is SshException.Channel -> SshFailure(FailureKind.CHANNEL, msg)
    is SshException.Sftp -> SshFailure(FailureKind.SFTP, msg)
    is SshException.Io -> SshFailure(FailureKind.IO, msg)
    is SshException.Disconnected -> SshFailure(FailureKind.DISCONNECTED, "disconnected")
}

private suspend fun <T> ffi(block: suspend () -> T): T = try {
    block()
} catch (e: SshException) {
    throw e.toFailure()
}

private class Bridge(private val cb: SshCallbacks) : SessionCallbacks {
    override suspend fun verifyHostKey(info: HostKeyInfo) = cb.verifyHostKey(info.toApi())
    override suspend fun keyboardInteractive(request: KbdRequest): List<String>? = cb.keyboardInteractive(
        KbdRound(request.name, request.instructions, request.prompts.map { it.prompt to it.echo }, request.round.toInt()),
    )
    override fun onBanner(banner: String) {}
    override fun onDisconnect(reason: String) = cb.onDisconnect(reason)
}

private class RusshSession(private val s: Session) : SshSession {
    override val hostKey get() = s.hostKey().toApi()
    override val algorithms get() = s.algorithms()?.let { listOf(it.kex, it.hostKey, it.cipher, it.mac) } ?: emptyList()
    override val isClosed get() = s.isClosed()

    override suspend fun connectVia(config: SshConfig, callbacks: SshCallbacks): SshSession =
        ffi { RusshSession(s.connectVia(config.toFfi(), Bridge(callbacks))) }

    override suspend fun exec(command: String) = ffi {
        val r = s.exec(command)
        ExecOut(r.stdout, r.stderr, r.exitCode?.toInt())
    }

    override suspend fun openShell(term: String, cols: Int, rows: Int, env: Map<String, String>, sink: ShellSink): SshShell = ffi {
        val sh = s.openShell(term, cols.toUInt(), rows.toUInt(), env.map { EnvVar(it.key, it.value) }, object : ShellCallbacks {
            override fun onData(data: ByteArray) = sink.onData(data)
            override fun onExit(exitCode: UInt?) = sink.onExit(exitCode?.toInt())
        })
        object : SshShell {
            override suspend fun write(data: ByteArray) = ffi { sh.write(data) }
            override suspend fun resize(cols: Int, rows: Int) = ffi { sh.resize(cols.toUInt(), rows.toUInt()) }
            override suspend fun close() = ffi { sh.end() }
        }
    }

    // One SFTP channel per session, opened on first use.
    private var sftp: uniffi.termix_ssh_core.Sftp? = null
    private suspend fun sftp() = sftp ?: s.openSftp().also { sftp = it }

    private fun progress(p: ((Long, Long) -> Unit)?) = p?.let {
        object : ProgressCallback {
            override fun onProgress(done: ULong, total: ULong) = it(done.toLong(), total.toLong())
        }
    }

    override suspend fun list(path: String) = ffi {
        sftp().list(path).map { RemoteFile(it.name, it.size.toLong(), it.isDir, it.isSymlink) }
    }

    override suspend fun download(remote: String, local: String, progress: ((Long, Long) -> Unit)?) = ffi {
        val r = sftp().download(remote, local, progress(progress))
        Transfer(r.bytes.toLong(), r.millis.toLong())
    }

    override suspend fun upload(local: String, remote: String, progress: ((Long, Long) -> Unit)?) = ffi {
        val r = sftp().upload(local, remote, progress(progress))
        Transfer(r.bytes.toLong(), r.millis.toLong())
    }

    override suspend fun remove(path: String) = ffi { sftp().remove(path) }

    override suspend fun forwardLocal(bindPort: Int, host: String, port: Int): SshForward = ffi {
        val f = s.forwardLocal("127.0.0.1", bindPort.toUShort(), host, port.toUShort())
        object : SshForward {
            override val port = f.port().toInt()
            override fun close() = f.stop()
        }
    }

    override suspend fun forwardDynamic(bindPort: Int): SshForward = ffi {
        val f = s.forwardDynamic("127.0.0.1", bindPort.toUShort())
        object : SshForward {
            override val port = f.port().toInt()
            override fun close() = f.stop()
        }
    }

    override suspend fun close() {
        runCatching { s.disconnect() }
        s.close()
    }
}

class RusshEngine : SshEngine {
    override val name = "russh"
    override val version: String get() = engineVersion()
    override suspend fun connect(config: SshConfig, callbacks: SshCallbacks): SshSession =
        ffi { RusshSession(uniffi.termix_ssh_core.connect(config.toFfi(), Bridge(callbacks))) }
}
