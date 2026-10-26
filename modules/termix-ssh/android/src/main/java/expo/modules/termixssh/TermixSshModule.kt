package expo.modules.termixssh

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.termixdisplay.FrameBuffer
import expo.modules.termixdisplay.TermixFrames
import expo.modules.termixpipe.PipeProducer
import expo.modules.termixpipe.TermixPipes
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import uniffi.termix_ssh_core.CancelToken
import uniffi.termix_ssh_core.ConnectConfig
import uniffi.termix_ssh_core.DialConfig
import uniffi.termix_ssh_core.DisplayCallbacks
import uniffi.termix_ssh_core.DisplayConfig
import uniffi.termix_ssh_core.DisplayProtocol
import uniffi.termix_ssh_core.RemoteDisplay
import uniffi.termix_ssh_core.TelnetConfig
import uniffi.termix_ssh_core.TelnetShell
import uniffi.termix_ssh_core.DisconnectKind
import uniffi.termix_ssh_core.EnvVar
import uniffi.termix_ssh_core.ExecCallbacks
import uniffi.termix_ssh_core.ExecHandle
import uniffi.termix_ssh_core.FileEntry
import uniffi.termix_ssh_core.Forward
import uniffi.termix_ssh_core.HostKeyInfo
import uniffi.termix_ssh_core.KbdRequest
import uniffi.termix_ssh_core.PortKnock
import uniffi.termix_ssh_core.ProgressCallback
import uniffi.termix_ssh_core.ProxyHop
import uniffi.termix_ssh_core.ProxyKind
import uniffi.termix_ssh_core.PtySize
import uniffi.termix_ssh_core.Session
import uniffi.termix_ssh_core.SessionCallbacks
import uniffi.termix_ssh_core.Sftp
import uniffi.termix_ssh_core.Shell
import uniffi.termix_ssh_core.ShellCallbacks
import uniffi.termix_ssh_core.SshException
import uniffi.termix_ssh_core.connect
import uniffi.termix_ssh_core.connectTelnet
import uniffi.termix_ssh_core.displayProtocols
import uniffi.termix_ssh_core.openDisplay
import uniffi.termix_ssh_core.convertKeyToOpenssh
import uniffi.termix_ssh_core.engineVersion
import uniffi.termix_ssh_core.inspectCertificate
import uniffi.termix_ssh_core.inspectKey
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

// How long a login waits for the user to answer a host key or prompt.
private const val PROMPT_TIMEOUT_MS = 5 * 60 * 1000L

private class SshCodedException(code: String, message: String) : CodedException(code, message, null)

private fun SshException.coded(): CodedException = when (this) {
    is SshException.Connect -> SshCodedException("SSH_CONNECT", msg)
    is SshException.HostKeyRejected -> SshCodedException("SSH_HOST_KEY_REJECTED", "Host key was rejected")
    is SshException.PassphraseRequired -> SshCodedException("SSH_PASSPHRASE_REQUIRED", "The key needs a passphrase")
    is SshException.BadPassphrase -> SshCodedException("SSH_BAD_PASSPHRASE", "Wrong passphrase")
    is SshException.InvalidKey -> SshCodedException("SSH_INVALID_KEY", msg)
    is SshException.Auth -> SshCodedException("SSH_AUTH", msg)
    is SshException.AuthMethodNotAvailable -> SshCodedException("SSH_AUTH_METHOD_NOT_AVAILABLE", msg)
    is SshException.AuthCancelled -> SshCodedException("SSH_AUTH_CANCELLED", "Login cancelled")
    is SshException.Cancelled -> SshCodedException("SSH_CANCELLED", "Cancelled")
    is SshException.Timeout -> SshCodedException("SSH_TIMEOUT", "Timed out")
    is SshException.Channel -> SshCodedException("SSH_CHANNEL", msg)
    is SshException.Sftp -> SshCodedException("SSH_SFTP", msg)
    is SshException.Io -> SshCodedException("SSH_IO", msg)
    is SshException.Disconnected -> SshCodedException("SSH_DISCONNECTED", "Disconnected")
}

private suspend fun <T> ssh(block: suspend () -> T): T = try {
    block()
} catch (e: SshException) {
    throw e.coded()
}

private fun <T> sshSync(block: () -> T): T = try {
    block()
} catch (e: SshException) {
    throw e.coded()
}

private fun b64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

private fun unb64(text: String): ByteArray = Base64.decode(text, Base64.DEFAULT)

private fun localPath(path: String) = path.removePrefix("file://")

private fun Map<String, Any?>.str(key: String) = this[key] as? String

private fun Map<String, Any?>.int(key: String, fallback: Int) = (this[key] as? Number)?.toInt() ?: fallback

private fun Map<String, Any?>.bool(key: String, fallback: Boolean) = this[key] as? Boolean ?: fallback

@Suppress("UNCHECKED_CAST")
private fun Map<String, Any?>.list(key: String) = (this[key] as? List<Map<String, Any?>>) ?: emptyList()

private fun parseProxies(c: Map<String, Any?>) = c.list("proxies").map {
    ProxyHop(
        kind = when (it.str("kind")) {
            "socks4" -> ProxyKind.SOCKS4
            "http" -> ProxyKind.HTTP
            else -> ProxyKind.SOCKS5
        },
        host = it.str("host") ?: "",
        port = it.int("port", 1080).toUShort(),
        username = it.str("username"),
        password = it.str("password"),
    )
}

private fun parseDial(c: Map<String, Any?>) = DialConfig(
    host = c.str("host") ?: throw SshCodedException("SSH_CONNECT", "No host"),
    port = c.int("port", 23).toUShort(),
    proxies = parseProxies(c),
    connectTimeoutSecs = c.int("connectTimeoutSecs", 15).toUInt(),
)

private fun parseDisplay(c: Map<String, Any?>) = DisplayConfig(
    dial = parseDial(c),
    protocol = if (c.str("protocol") == "rdp") DisplayProtocol.RDP else DisplayProtocol.VNC,
    username = c.str("username"),
    password = c.str("password"),
    domain = c.str("domain"),
    width = c.int("width", 1280).toUInt(),
    height = c.int("height", 720).toUInt(),
    scale = c.int("scale", 0).toUInt(),
    security = c.str("security") ?: "",
    serverCert = c.str("serverCert"),
)

private fun parseConfig(c: Map<String, Any?>) = ConnectConfig(
    host = c.str("host") ?: throw SshCodedException("SSH_CONNECT", "No host"),
    port = c.int("port", 22).toUShort(),
    username = c.str("username") ?: "",
    password = c.str("password"),
    privateKey = c.str("privateKey"),
    passphrase = c.str("passphrase"),
    certificate = c.str("certificate"),
    forceKeyboardInteractive = c.bool("forceKeyboardInteractive", false),
    tryKeyboard = c.bool("tryKeyboard", true),
    allowLegacyAlgorithms = c.bool("allowLegacyAlgorithms", true),
    connectTimeoutSecs = c.int("connectTimeoutSecs", 15).toUInt(),
    keepaliveIntervalSecs = c.int("keepaliveIntervalSecs", 30).toUInt(),
    keepaliveCountMax = c.int("keepaliveCountMax", 5).toUInt(),
    proxies = parseProxies(c),
    portKnock = c.list("portKnock").map {
        PortKnock(port = it.int("port", 0).toUShort(), udp = it.bool("udp", false), delayMs = it.int("delayMs", 100).toUInt())
    },
)

private fun HostKeyInfo.toMap() = mapOf(
    "host" to host,
    "port" to port.toInt(),
    "keyType" to keyType,
    "blobHex" to blobHex,
    "sha256" to sha256,
    "isCertificate" to isCertificate,
    "caSha256" to caSha256,
    "principals" to principals,
)

private fun FileEntry.toMap() = mapOf(
    "name" to name, "size" to size.toDouble(), "isDir" to isDir, "isSymlink" to isSymlink,
    "permissions" to permissions.toInt(), "mtime" to mtime.toDouble(), "atime" to atime.toDouble(),
    "uid" to uid?.toInt(), "gid" to gid?.toInt(), "linkTarget" to linkTarget,
)

private fun sessionInfo(s: Session) = mapOf(
    "hostKey" to s.hostKey().toMap(),
    "algorithms" to s.algorithms()?.let {
        mapOf("kex" to it.kex, "hostKey" to it.hostKey, "cipher" to it.cipher, "mac" to it.mac)
    },
)

private fun DisconnectKind.label() = when (this) {
    DisconnectKind.SERVER -> "server"
    DisconnectKind.KEEPALIVE -> "keepalive"
    DisconnectKind.NETWORK -> "network"
    DisconnectKind.LOCAL -> "local"
}

private class Live(val session: Session) {
    @Volatile var sftp: Sftp? = null

    fun destroy() {
        sftp?.destroy()
        sftp = null
        session.destroy()
    }
}

/** A channel object plus the session it belongs to, so a dropped session can clean up after itself. */
private class Owned<T>(val sessionId: String, val value: T)

private class Pending<T>(val sessionId: String, val answer: CompletableDeferred<T>)

class TermixSshModule : Module() {
    private val sessions = ConcurrentHashMap<String, Live>()
    private val shells = ConcurrentHashMap<String, Owned<Shell>>()
    private val telnets = ConcurrentHashMap<String, Owned<TelnetShell>>()
    private val displays = ConcurrentHashMap<String, Owned<RemoteDisplay>>()
    private val execs = ConcurrentHashMap<String, Owned<ExecHandle>>()
    private val forwards = ConcurrentHashMap<String, Owned<Forward>>()
    private val cancels = ConcurrentHashMap<String, CancelToken>()
    private val hostKeyAnswers = ConcurrentHashMap<String, Pending<Boolean>>()
    private val kbdAnswers = ConcurrentHashMap<String, Pending<List<String>?>>()
    private val requestIds = AtomicLong()

    private fun live(id: String) = sessions[id] ?: throw SshCodedException("SSH_DISCONNECTED", "No session $id")

    private suspend fun sftp(id: String): Sftp {
        val l = live(id)
        return l.sftp ?: ssh { l.session.openSftp() }.also { l.sftp = it }
    }

    // Runs a cancellable call; `cancel(opId)` from JS fires the token.
    private suspend fun <T> withCancel(opId: String, block: suspend (CancelToken) -> T): T {
        val token = CancelToken()
        cancels[opId] = token
        try {
            return ssh { block(token) }
        } finally {
            cancels.remove(opId)
            token.destroy()
        }
    }

    // The server dropped the session: close its channels but keep the record so JS can reconnect.
    private fun dropChannels(sessionId: String) {
        sessions[sessionId]?.let { l -> l.sftp?.destroy(); l.sftp = null }
        shells.entries.removeIf { (_, o) -> (o.sessionId == sessionId).also { if (it) o.value.destroy() } }
        telnets.entries.removeIf { (_, o) -> (o.sessionId == sessionId).also { if (it) o.value.destroy() } }
        displays.entries.removeIf { (_, o) ->
            (o.sessionId == sessionId).also { if (it) { o.value.stop(); o.value.destroy() } }
        }
        execs.entries.removeIf { (_, o) -> (o.sessionId == sessionId).also { if (it) o.value.destroy() } }
        forwards.entries.removeIf { (_, o) ->
            (o.sessionId == sessionId).also { if (it) { o.value.stop(); o.value.destroy() } }
        }
    }

    private fun callbacks(id: String) = object : SessionCallbacks {
        override suspend fun verifyHostKey(info: HostKeyInfo): Boolean {
            val requestId = "hk${requestIds.incrementAndGet()}"
            val pending = Pending(id, CompletableDeferred<Boolean>())
            hostKeyAnswers[requestId] = pending
            try {
                sendEvent("onHostKey", mapOf("sessionId" to id, "requestId" to requestId, "hostKey" to info.toMap()))
                return withTimeoutOrNull(PROMPT_TIMEOUT_MS) { pending.answer.await() } ?: false
            } finally {
                hostKeyAnswers.remove(requestId)
            }
        }

        override suspend fun keyboardInteractive(request: KbdRequest): List<String>? {
            val requestId = "kb${requestIds.incrementAndGet()}"
            val pending = Pending(id, CompletableDeferred<List<String>?>())
            kbdAnswers[requestId] = pending
            try {
                sendEvent(
                    "onKeyboardInteractive",
                    mapOf(
                        "sessionId" to id,
                        "requestId" to requestId,
                        "request" to mapOf(
                            "name" to request.name,
                            "instructions" to request.instructions,
                            "prompts" to request.prompts.map { mapOf("prompt" to it.prompt, "echo" to it.echo) },
                            "round" to request.round.toInt(),
                        ),
                    ),
                )
                return withTimeoutOrNull(PROMPT_TIMEOUT_MS) { pending.answer.await() }
            } finally {
                kbdAnswers.remove(requestId)
            }
        }

        override fun onBanner(banner: String) = sendEvent("onBanner", mapOf("sessionId" to id, "banner" to banner))

        override fun onDisconnect(kind: DisconnectKind, reason: String) {
            dropChannels(id)
            sendEvent("onDisconnect", mapOf("sessionId" to id, "kind" to kind.label(), "reason" to reason))
        }
    }

    // With a pipe the bytes go straight to the terminal view; JS only hears that output started.
    private fun shellSink(shellId: String, pipeId: String?, producer: () -> PipeProducer?) = object : ShellCallbacks {
        private val pipe = pipeId?.let { TermixPipes.get(it) }
        private var announced = false

        override fun onData(data: ByteArray) {
            if (pipe == null) {
                sendEvent("onShellData", mapOf("shellId" to shellId, "data" to b64(data)))
                return
            }
            pipe.push(data)
            if (!announced) {
                announced = true
                sendEvent("onShellActive", mapOf("shellId" to shellId))
            }
        }

        override fun onExit(exitCode: UInt?, exitSignal: String?) {
            shells.remove(shellId)?.value?.destroy()
            telnets.remove(shellId)?.value?.destroy()
            if (pipe != null && pipeId != null) {
                producer()?.let { pipe.detachProducer(it) }
                TermixPipes.release(pipeId)
            }
            sendEvent("onShellExit", mapOf("shellId" to shellId, "exitCode" to exitCode?.toInt(), "exitSignal" to exitSignal))
        }
    }

    // Frames go straight into the display view's buffer; JS only hears size, clipboard and the end.
    private fun displaySink(displayId: String) = object : DisplayCallbacks {
        private val frame: FrameBuffer = TermixFrames.get(displayId)

        override fun onResize(width: UInt, height: UInt) {
            frame.resize(width.toInt(), height.toInt())
            sendEvent("onDisplayResize", mapOf("displayId" to displayId, "width" to width.toInt(), "height" to height.toInt()))
        }

        override fun onFrame(x: UInt, y: UInt, width: UInt, height: UInt, rgba: ByteArray) {
            frame.blit(x.toInt(), y.toInt(), width.toInt(), height.toInt(), rgba)
        }

        override fun onClipboard(text: String) = sendEvent("onDisplayClipboard", mapOf("displayId" to displayId, "text" to text))

        override fun onClosed(reason: String?) {
            displays.remove(displayId)?.value?.destroy()
            TermixFrames.release(displayId)
            sendEvent("onDisplayClosed", mapOf("displayId" to displayId, "reason" to reason))
        }
    }

    private fun progress(opId: String) = object : ProgressCallback {
        override fun onProgress(done: ULong, total: ULong) {
            sendEvent("onProgress", mapOf("opId" to opId, "done" to done.toDouble(), "total" to total.toDouble()))
        }
    }

    override fun definition() = ModuleDefinition {
        Name("TermixSsh")

        Events(
            "onHostKey", "onKeyboardInteractive", "onBanner", "onDisconnect",
            "onShellData", "onShellActive", "onShellExit", "onExecData", "onExecExit", "onProgress",
            "onDisplayResize", "onDisplayClipboard", "onDisplayClosed",
        )

        Function("engineVersion") { engineVersion() }

        AsyncFunction("connect") Coroutine { id: String, c: Map<String, Any?>, parentId: String? ->
            val config = parseConfig(c)
            val session = withCancel(id) { token ->
                if (parentId != null) live(parentId).session.connectVia(config, callbacks(id), token)
                else connect(config, callbacks(id), token)
            }
            sessions[id] = Live(session)
            sessionInfo(session)
        }

        AsyncFunction("reconnect") Coroutine { id: String ->
            val old = live(id)
            val fresh = withCancel(id) { token -> old.session.reconnect(token) }
            sessions[id] = Live(fresh)
            dropChannels(id)
            old.destroy()
            sessionInfo(fresh)
        }

        Function("cancel") { opId: String ->
            cancels[opId]?.cancel()
            // A login waiting on the user gives up right away.
            hostKeyAnswers.values.filter { it.sessionId == opId }.forEach { it.answer.complete(false) }
            kbdAnswers.values.filter { it.sessionId == opId }.forEach { it.answer.complete(null) }
        }

        Function("answerHostKey") { requestId: String, accept: Boolean -> hostKeyAnswers[requestId]?.answer?.complete(accept) }

        Function("answerKeyboardInteractive") { requestId: String, answers: List<String>? ->
            kbdAnswers[requestId]?.answer?.complete(answers)
        }

        Function("isClosed") { id: String -> sessions[id]?.session?.isClosed() ?: true }

        AsyncFunction("ping") Coroutine { id: String, timeoutSecs: Int -> ssh { live(id).session.ping(timeoutSecs.toUInt()) } }

        AsyncFunction("disconnect") Coroutine { id: String ->
            val l = sessions.remove(id) ?: return@Coroutine
            dropChannels(id)
            runCatching { l.session.disconnect() }
            l.destroy()
        }

        AsyncFunction("exec") Coroutine { id: String, opId: String, command: String, timeoutSecs: Int, maxBytes: Double ->
            val r = withCancel(opId) { token ->
                live(id).session.exec(command, timeoutSecs.toUInt(), maxBytes.toLong().toULong(), token)
            }
            mapOf(
                "stdout" to b64(r.stdout), "stderr" to b64(r.stderr), "exitCode" to r.exitCode?.toInt(),
                "exitSignal" to r.exitSignal, "truncated" to r.truncated,
            )
        }

        AsyncFunction("execStream") Coroutine { id: String, execId: String, command: String, pty: Map<String, Any?>? ->
            val size = pty?.let { PtySize(it.str("term") ?: "xterm-256color", it.int("cols", 80).toUInt(), it.int("rows", 24).toUInt()) }
            val handle = ssh {
                live(id).session.execStream(
                    command, size,
                    object : ExecCallbacks {
                        override fun onStdout(data: ByteArray) =
                            sendEvent("onExecData", mapOf("execId" to execId, "stream" to "stdout", "data" to b64(data)))
                        override fun onStderr(data: ByteArray) =
                            sendEvent("onExecData", mapOf("execId" to execId, "stream" to "stderr", "data" to b64(data)))
                        override fun onExit(exitCode: UInt?, exitSignal: String?) {
                            execs.remove(execId)?.value?.destroy()
                            sendEvent("onExecExit", mapOf("execId" to execId, "exitCode" to exitCode?.toInt(), "exitSignal" to exitSignal))
                        }
                    },
                )
            }
            execs[execId] = Owned(id, handle)
        }

        AsyncFunction("execWrite") Coroutine { execId: String, data: String ->
            val h = execs[execId]?.value ?: throw SshCodedException("SSH_DISCONNECTED", "Command ended")
            ssh { h.write(unb64(data)) }
        }

        AsyncFunction("execEof") Coroutine { execId: String -> execs[execId]?.value?.let { ssh { it.eof() } } }

        AsyncFunction("execSignal") Coroutine { execId: String, name: String -> execs[execId]?.value?.let { ssh { it.signal(name) } } }

        AsyncFunction("execClose") Coroutine { execId: String -> execs[execId]?.value?.let { runCatching { it.end() } } }

        AsyncFunction("openShell") Coroutine { id: String, shellId: String, term: String, cols: Int, rows: Int, env: Map<String, String>, pipeId: String? ->
            var producer: PipeProducer? = null
            val shell = ssh {
                live(id).session.openShell(
                    term, cols.toUInt(), rows.toUInt(), env.map { EnvVar(it.key, it.value) },
                    shellSink(shellId, pipeId) { producer },
                )
            }
            shells[shellId] = Owned(id, shell)
            pipeId?.let { TermixPipes.get(it) }?.let { pipe ->
                val p = object : PipeProducer {
                    override fun pause() = shell.pause()
                    override fun resume() = shell.resume()
                }
                producer = p
                pipe.setProducer(p)
            }
        }

        // Telnet shells use the same write, resize and close calls as SSH shells.
        AsyncFunction("openTelnet") Coroutine { shellId: String, dial: Map<String, Any?>, term: String, cols: Int, rows: Int, login: Map<String, String>, viaId: String?, pipeId: String? ->
            val config = TelnetConfig(parseDial(dial), term, cols.toUInt(), rows.toUInt(), login["username"], login["password"])
            val via = viaId?.let { live(it).session }
            var producer: PipeProducer? = null
            val shell = ssh { connectTelnet(config, via, shellSink(shellId, pipeId) { producer }) }
            telnets[shellId] = Owned(viaId ?: "", shell)
            pipeId?.let { TermixPipes.get(it) }?.let { pipe ->
                val p = object : PipeProducer {
                    override fun pause() = shell.pause()
                    override fun resume() = shell.resume()
                }
                producer = p
                pipe.setProducer(p)
            }
        }

        AsyncFunction("writeShell") Coroutine { shellId: String, data: String ->
            val telnet = telnets[shellId]?.value
            if (telnet != null) {
                ssh { telnet.write(unb64(data)) }
            } else {
                val shell = shells[shellId]?.value ?: throw SshCodedException("SSH_DISCONNECTED", "Shell closed")
                ssh { shell.write(unb64(data)) }
            }
        }

        AsyncFunction("resizeShell") Coroutine { shellId: String, cols: Int, rows: Int ->
            val telnet = telnets[shellId]?.value
            if (telnet != null) {
                ssh { telnet.resize(cols.toUInt(), rows.toUInt()) }
            } else {
                shells[shellId]?.value?.let { ssh { it.resize(cols.toUInt(), rows.toUInt()) } }
            }
        }

        AsyncFunction("signalShell") Coroutine { shellId: String, name: String ->
            shells[shellId]?.value?.let { ssh { it.signal(name) } }
        }

        AsyncFunction("closeShell") Coroutine { shellId: String ->
            shells[shellId]?.value?.let { s -> runCatching { s.end() } }
            telnets[shellId]?.value?.let { t -> runCatching { t.end() } }
        }

        Function("displayProtocols") { displayProtocols().map { if (it == DisplayProtocol.RDP) "rdp" else "vnc" } }

        AsyncFunction("openDisplay") Coroutine { displayId: String, c: Map<String, Any?>, viaId: String? ->
            val config = parseDisplay(c)
            val via = viaId?.let { live(it).session }
            val display = ssh { openDisplay(config, via, displaySink(displayId)) }
            displays[displayId] = Owned(viaId ?: "", display)
        }

        Function("displayPointer") { displayId: String, x: Int, y: Int, buttons: Int ->
            displays[displayId]?.value?.pointer(maxOf(0, x).toUInt(), maxOf(0, y).toUInt(), (buttons and 0xff).toUByte())
        }

        Function("displayKeySym") { displayId: String, sym: Int, down: Boolean -> displays[displayId]?.value?.keySym(sym.toUInt(), down) }

        Function("displayUnicode") { displayId: String, ch: Int, down: Boolean -> displays[displayId]?.value?.unicode(ch.toUInt(), down) }

        Function("displayClipboard") { displayId: String, text: String -> displays[displayId]?.value?.clipboardSet(text) }

        Function("displayResize") { displayId: String, width: Int, height: Int, scale: Int ->
            displays[displayId]?.value?.resize(width.toUInt(), height.toUInt(), scale.toUInt())
        }

        Function("displayRefresh") { displayId: String -> displays[displayId]?.value?.refresh() }

        Function("closeDisplay") { displayId: String ->
            displays.remove(displayId)?.value?.let { it.stop(); it.destroy() }
        }

        AsyncFunction("sftpList") Coroutine { id: String, path: String -> ssh { sftp(id).list(path) }.map { it.toMap() } }

        AsyncFunction("sftpStat") Coroutine { id: String, path: String -> ssh { sftp(id).stat(path) }.toMap() }

        AsyncFunction("sftpLstat") Coroutine { id: String, path: String -> ssh { sftp(id).lstat(path) }.toMap() }

        AsyncFunction("sftpSize") Coroutine { id: String, path: String -> ssh { sftp(id).size(path) }.toDouble() }

        AsyncFunction("sftpRealpath") Coroutine { id: String, path: String -> ssh { sftp(id).realpath(path) } }

        AsyncFunction("sftpReadLink") Coroutine { id: String, path: String -> ssh { sftp(id).readLink(path) } }

        AsyncFunction("sftpSymlink") Coroutine { id: String, path: String, target: String -> ssh { sftp(id).symlink(path, target) } }

        AsyncFunction("sftpMkdir") Coroutine { id: String, path: String, mode: Int? -> ssh { sftp(id).mkdir(path, mode?.toUInt()) } }

        AsyncFunction("sftpRmdir") Coroutine { id: String, path: String -> ssh { sftp(id).rmdir(path) } }

        AsyncFunction("sftpRename") Coroutine { id: String, from: String, to: String -> ssh { sftp(id).rename(from, to) } }

        AsyncFunction("sftpChmod") Coroutine { id: String, path: String, mode: Int -> ssh { sftp(id).chmod(path, mode.toUInt()) } }

        AsyncFunction("sftpRemove") Coroutine { id: String, path: String -> ssh { sftp(id).remove(path) } }

        AsyncFunction("sftpRemoveRecursive") Coroutine { id: String, opId: String, path: String ->
            val s = sftp(id)
            withCancel(opId) { token -> s.removeRecursive(path, progress(opId), token) }.toDouble()
        }

        AsyncFunction("sftpReadFile") Coroutine { id: String, path: String, maxBytes: Double ->
            b64(ssh { sftp(id).readFile(path, maxBytes.toLong().toULong()) })
        }

        AsyncFunction("sftpWriteFile") Coroutine { id: String, path: String, data: String, mode: Int? ->
            ssh { sftp(id).writeFile(path, unb64(data), mode?.toUInt()) }
        }

        AsyncFunction("sftpDownload") Coroutine { id: String, opId: String, remote: String, local: String, offset: Double ->
            val s = sftp(id)
            val r = withCancel(opId) { token -> s.download(remote, localPath(local), offset.toLong().toULong(), progress(opId), token) }
            mapOf("bytes" to r.bytes.toDouble(), "millis" to r.millis.toDouble())
        }

        AsyncFunction("sftpUpload") Coroutine { id: String, opId: String, local: String, remote: String, offset: Double ->
            val s = sftp(id)
            val r = withCancel(opId) { token -> s.upload(localPath(local), remote, offset.toLong().toULong(), progress(opId), token) }
            mapOf("bytes" to r.bytes.toDouble(), "millis" to r.millis.toDouble())
        }

        AsyncFunction("forwardLocal") Coroutine { id: String, forwardId: String, bindHost: String, bindPort: Int, host: String, port: Int ->
            val f = ssh { live(id).session.forwardLocal(bindHost, bindPort.toUShort(), host, port.toUShort()) }
            forwards[forwardId] = Owned(id, f)
            f.port().toInt()
        }

        AsyncFunction("forwardDynamic") Coroutine { id: String, forwardId: String, bindHost: String, bindPort: Int ->
            val f = ssh { live(id).session.forwardDynamic(bindHost, bindPort.toUShort()) }
            forwards[forwardId] = Owned(id, f)
            f.port().toInt()
        }

        AsyncFunction("forwardRemote") Coroutine { id: String, forwardId: String, remoteHost: String, remotePort: Int, localHost: String, localPort: Int ->
            val f = ssh { live(id).session.forwardRemote(remoteHost, remotePort.toUShort(), localHost, localPort.toUShort()) }
            forwards[forwardId] = Owned(id, f)
            f.port().toInt()
        }

        AsyncFunction("closeForward") Coroutine { forwardId: String ->
            forwards.remove(forwardId)?.value?.let { f ->
                runCatching { f.shutdown() }
                f.destroy()
            }
        }

        Function("inspectKey") { text: String, passphrase: String? ->
            val k = sshSync { inspectKey(text, passphrase) }
            mapOf(
                "keyType" to k.keyType, "bits" to k.bits.toInt(), "sha256" to k.sha256, "publicOpenssh" to k.publicOpenssh,
                "encrypted" to k.encrypted, "format" to k.format, "comment" to k.comment,
            )
        }

        Function("convertKeyToOpenssh") { text: String, passphrase: String?, newPassphrase: String? ->
            sshSync { convertKeyToOpenssh(text, passphrase, newPassphrase) }
        }

        Function("inspectCertificate") { text: String ->
            val c = sshSync { inspectCertificate(text) }
            mapOf(
                "keyType" to c.keyType, "keyId" to c.keyId, "serial" to c.serial.toDouble(), "principals" to c.principals,
                "validAfter" to c.validAfter.toDouble(), "validBefore" to c.validBefore.toDouble(),
                "caSha256" to c.caSha256, "isHost" to c.isHost,
            )
        }

        OnDestroy {
            cancels.values.forEach { it.cancel() }
            forwards.values.forEach { it.value.stop(); it.value.destroy() }
            forwards.clear()
            execs.values.forEach { it.value.destroy() }
            execs.clear()
            shells.values.forEach { it.value.destroy() }
            shells.clear()
            telnets.values.forEach { it.value.destroy() }
            telnets.clear()
            displays.values.forEach { it.value.stop(); it.value.destroy() }
            displays.clear()
            sessions.values.forEach { it.destroy() }
            sessions.clear()
        }
    }
}
