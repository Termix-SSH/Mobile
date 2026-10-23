package termix.ssh.libssh2

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import termix.ssh.api.*
import java.util.concurrent.atomic.AtomicReference

private val kinds = FailureKind.entries

private suspend fun <T> io(block: () -> T): T = withContext(Dispatchers.IO) {
    try {
        block()
    } catch (e: NativeError) {
        // tx_error codes start at 1 and follow FailureKind order
        throw SshFailure(kinds.getOrElse(e.code - 1) { FailureKind.IO }, e.message ?: "")
    }
}

private class Bridge(private val cb: SshCallbacks, val key: AtomicReference<HostKey?>) : NativeCallbacks {
    override fun verifyHostKey(type: String, blobHex: String, sha256: String, isCert: Boolean, caSha256: String, principals: String): Boolean {
        val k = HostKey(type, blobHex, sha256, isCert, caSha256.ifEmpty { null }, principals.split(",").filter { it.isNotEmpty() })
        key.set(k)
        return runBlocking { cb.verifyHostKey(k) }
    }

    override fun keyboardInteractive(name: String, instructions: String, prompts: Array<String>, echo: BooleanArray, round: Int): Array<String>? =
        runBlocking { cb.keyboardInteractive(KbdRound(name, instructions, prompts.indices.map { prompts[it] to echo[it] }, round)) }
            ?.toTypedArray()

    override fun onBanner(banner: String) {}
    override fun onDisconnect(reason: String) = cb.onDisconnect(reason)
}

private class Libssh2Session(private val h: Long, override val hostKey: HostKey) : SshSession {
    private val shells = mutableListOf<Long>()
    private val children = mutableListOf<Libssh2Session>()
    @Volatile private var freed = false

    override val algorithms: List<String> get() = Native.algorithms(h).toList()
    override val isClosed get() = freed || Native.isClosed(h)

    override suspend fun connectVia(config: SshConfig, callbacks: SshCallbacks): SshSession {
        val child = connectNative(h, config, callbacks)
        children.add(child)
        return child
    }

    override suspend fun exec(command: String) = io {
        val r = Native.exec(h, command)
        ExecOut(r[0] as ByteArray, r[1] as ByteArray, r[2] as Int)
    }

    override suspend fun openShell(term: String, cols: Int, rows: Int, env: Map<String, String>, sink: ShellSink): SshShell = io {
        val sh = Native.shellOpen(h, term, cols, rows, env.keys.toTypedArray(), env.values.toTypedArray(), object : NativeShellCallbacks {
            override fun onData(data: ByteArray) = sink.onData(data)
            override fun onExit(hasCode: Boolean, code: Int) = sink.onExit(if (hasCode) code else null)
        })
        synchronized(shells) { shells.add(sh) }
        object : SshShell {
            override suspend fun write(data: ByteArray) = io { Native.shellWrite(sh, data) }
            override suspend fun resize(cols: Int, rows: Int) = io { Native.shellResize(sh, cols, rows) }
            override suspend fun close() = io { Native.shellClose(sh) }
        }
    }

    private fun progress(p: ((Long, Long) -> Unit)?) = p?.let {
        object : NativeProgress {
            override fun onProgress(done: Long, total: Long) = it(done, total)
        }
    }

    override suspend fun list(path: String) = io {
        Native.sftpList(h, path).map { RemoteFile(it.name, it.size, it.isDir, it.isSymlink) }
    }

    override suspend fun download(remote: String, local: String, progress: ((Long, Long) -> Unit)?) = io {
        val r = Native.sftpDownload(h, remote, local, progress(progress))
        Transfer(r[0], r[1])
    }

    override suspend fun upload(local: String, remote: String, progress: ((Long, Long) -> Unit)?) = io {
        val r = Native.sftpUpload(h, local, remote, progress(progress))
        Transfer(r[0], r[1])
    }

    override suspend fun remove(path: String) = io { Native.sftpRemove(h, path) }

    private fun forward(f: Long) = object : SshForward {
        override val port = Native.forwardPort(f)
        override fun close() = Native.forwardClose(f)
    }

    override suspend fun forwardLocal(bindPort: Int, host: String, port: Int) = io {
        forward(Native.forwardLocal(h, "127.0.0.1", bindPort, host, port))
    }

    override suspend fun forwardDynamic(bindPort: Int) = io { forward(Native.forwardDynamic(h, "127.0.0.1", bindPort)) }

    override suspend fun close() = io {
        if (freed) return@io
        freed = true
        children.forEach { if (!it.freed) { it.freed = true; it.freeNative() } }
        freeNative()
    }

    fun freeNative() {
        Native.free(h)
        synchronized(shells) { shells.forEach { Native.shellFree(it) }; shells.clear() }
    }

    companion object {
        suspend fun connectNative(parent: Long, c: SshConfig, cb: SshCallbacks): Libssh2Session {
            val key = AtomicReference<HostKey?>(null)
            val bridge = Bridge(cb, key)
            val h = io {
                Native.connect(parent, c.host, c.port, c.username, c.password, c.privateKey, c.passphrase, c.certificate,
                    c.forceKeyboardInteractive, c.allowLegacyAlgorithms, c.connectTimeoutSecs, c.keepaliveIntervalSecs,
                    c.keepaliveCountMax, bridge)
            }
            return Libssh2Session(h, key.get()!!)
        }
    }
}

class Libssh2Engine : SshEngine {
    override val name = "libssh2"
    override val version: String get() = Native.version()
    override suspend fun connect(config: SshConfig, callbacks: SshCallbacks): SshSession =
        Libssh2Session.connectNative(0, config, callbacks)
}
