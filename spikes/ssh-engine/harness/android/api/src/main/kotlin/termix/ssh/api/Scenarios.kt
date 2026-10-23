package termix.ssh.api

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.Collections
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.concurrent.thread

/** Where the test servers are and how to measure things on this platform. */
class TestEnv(
    val host: String,
    val platform: String,
    val keys: (String) -> String,
    val algosJson: String,
    val tempDir: File,
    /** Bytes this process uses right now, for the streaming check. */
    val memory: () -> Long,
    val record: (String) -> Unit,
    val targetPort: Int = 2222,
    val jumpPort: Int = 2223,
    /** Name of the target as the jump host sees it. */
    val jumpTarget: String = "target",
    val bigFile: String = "/data/big.bin",
)

class ScenarioResult(val name: String, val ok: Boolean, val detail: Map<String, Any?>, val error: Throwable?)

private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

fun totp(secret: String, now: Long = System.currentTimeMillis()): String {
    val alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    var bits = 0
    var value = 0
    val out = ArrayList<Byte>()
    for (c in secret.trim()) {
        value = (value shl 5) or alpha.indexOf(c)
        bits += 5
        if (bits >= 8) {
            bits -= 8
            out.add(((value shr bits) and 0xff).toByte())
        }
    }
    val mac = Mac.getInstance("HmacSHA1")
    mac.init(SecretKeySpec(out.toByteArray(), "HmacSHA1"))
    val step = now / 1000 / 30
    val h = mac.doFinal(java.nio.ByteBuffer.allocate(8).putLong(step).array())
    val o = h[19].toInt() and 0xf
    val n = ((h[o].toInt() and 0x7f) shl 24) or ((h[o + 1].toInt() and 0xff) shl 16) or
        ((h[o + 2].toInt() and 0xff) shl 8) or (h[o + 3].toInt() and 0xff)
    return "%06d".format(n % 1_000_000)
}

open class TestCallbacks(private val env: TestEnv, private val reject: Boolean = false) : SshCallbacks {
    val keys = Collections.synchronizedList(mutableListOf<HostKey>())
    val rounds = Collections.synchronizedList(mutableListOf<KbdRound>())
    val disconnects = Collections.synchronizedList(mutableListOf<Pair<Long, String>>())

    override suspend fun verifyHostKey(key: HostKey): Boolean {
        keys.add(key)
        return !reject
    }

    override suspend fun keyboardInteractive(round: KbdRound): List<String>? {
        rounds.add(round)
        return round.prompts.map { (p, _) ->
            if (p.lowercase().contains("verification")) totp(env.keys("totp_secret")) else "termix-pass"
        }
    }

    override fun onDisconnect(reason: String) {
        disconnects.add(System.currentTimeMillis() to reason)
    }
}

class Collector : ShellSink {
    private val buf = java.io.ByteArrayOutputStream()
    @Volatile var exit: Int? = null
    @Volatile var exited = false
    override fun onData(data: ByteArray) = synchronized(buf) { buf.write(data) }
    override fun onExit(code: Int?) { exit = code; exited = true }
    fun text() = synchronized(buf) { buf.toString("UTF-8") }
    suspend fun waitFor(needle: String, secs: Int = 10): Boolean {
        val end = System.currentTimeMillis() + secs * 1000
        while (System.currentTimeMillis() < end) {
            if (text().contains(needle)) return true
            delay(50)
        }
        return false
    }
}

/** A TCP relay the test can freeze, so packets stop with no FIN, like a phone losing signal. */
class FreezableRelay(private val targetHost: String, private val targetPort: Int) : AutoCloseable {
    private val server = ServerSocket().apply { bind(InetSocketAddress("127.0.0.1", 0)) }
    val port: Int get() = server.localPort
    val frozen = AtomicBoolean(false)
    private val sockets = Collections.synchronizedList(mutableListOf<Socket>())

    init {
        thread(isDaemon = true) {
            while (!server.isClosed) {
                val c = try { server.accept() } catch (_: Exception) { break }
                val up = Socket(targetHost, targetPort)
                sockets.add(c); sockets.add(up)
                pipe(c.getInputStream(), up.getOutputStream())
                pipe(up.getInputStream(), c.getOutputStream())
            }
        }
    }

    private fun pipe(i: InputStream, o: OutputStream) = thread(isDaemon = true) {
        val b = ByteArray(65536)
        try {
            while (true) {
                val n = i.read(b)
                if (n < 0) break
                // Frozen: swallow bytes and never answer.
                while (frozen.get()) Thread.sleep(50)
                o.write(b, 0, n)
                o.flush()
            }
        } catch (_: Exception) {
        }
    }

    override fun close() {
        frozen.set(false)
        server.close()
        sockets.forEach { runCatching { it.close() } }
    }
}

class Scenarios(private val engine: SshEngine, private val env: TestEnv) {
    private fun cfg(user: String, port: Int = env.targetPort) = SshConfig(env.host, port, user)
    private fun keyCfg(name: String = "id_ed25519") = cfg("key").copy(privateKey = env.keys(name))
    private fun cb(reject: Boolean = false) = TestCallbacks(env, reject)

    private suspend fun text(s: SshSession, cmd: String) = String(s.exec(cmd).stdout).trim()

    private suspend fun expectFailure(kind: FailureKind, block: suspend () -> Unit) {
        try {
            block()
        } catch (e: SshFailure) {
            check(e.kind == kind) { "expected $kind, got ${e.kind}: ${e.message}" }
            return
        }
        error("expected $kind, but it worked")
    }

    private fun json(v: Any?): String = when (v) {
        null -> "null"
        is Number, is Boolean -> v.toString()
        is Map<*, *> -> v.entries.joinToString(",", "{", "}") { "\"${it.key}\":${json(it.value)}" }
        else -> "\"" + v.toString().replace("\\", "/").replace("\"", "'").replace("\n", " ") + "\""
    }

    private fun emit(r: ScenarioResult) {
        val err = r.error?.let { "${it::class.simpleName}: ${it.message}" }
        env.record(
            "{\"engine\":\"${engine.name}\",\"platform\":\"${env.platform}\",\"scenario\":\"${r.name}\"," +
                "\"ok\":${r.ok},\"detail\":${json(r.detail + mapOf("error" to err))}}",
        )
    }

    private suspend fun run(name: String, block: suspend (MutableMap<String, Any?>) -> Unit): ScenarioResult {
        val detail = mutableMapOf<String, Any?>()
        val res = try {
            withTimeout(600_000) { block(detail) }
            ScenarioResult(name, true, detail, null)
        } catch (e: Throwable) {
            ScenarioResult(name, false, detail, e)
        }
        emit(res)
        return res
    }

    suspend fun authPassword() = run("auth.password") {
        val s = engine.connect(cfg("pw").copy(password = "termix-pass"), cb())
        check(text(s, "whoami") == "pw")
        s.close()
        expectFailure(FailureKind.AUTH) { engine.connect(cfg("pw").copy(password = "nope"), cb()) }
    }

    suspend fun authKey(name: String) = run("auth.key.$name") {
        engine.connect(keyCfg(name), cb()).close()
    }

    suspend fun authKeyPassphrase() = run("auth.key.passphrase") {
        for (name in listOf("id_ed25519_pass", "id_rsa_pass")) {
            val c = keyCfg(name)
            expectFailure(FailureKind.PASSPHRASE_REQUIRED) { engine.connect(c, cb()) }
            expectFailure(FailureKind.BAD_PASSPHRASE) { engine.connect(c.copy(passphrase = "wrong"), cb()) }
            engine.connect(c.copy(passphrase = "termix-key"), cb()).close()
        }
    }

    suspend fun authKeyThenPassword() = run("auth.key+password") {
        engine.connect(cfg("kp").copy(privateKey = env.keys("id_ed25519"), password = "termix-pass"), cb()).close()
    }

    suspend fun authKbd() = run("auth.kbd") { d ->
        val c = cb()
        engine.connect(cfg("kbd"), c).close()
        d["rounds"] = c.rounds.size
        check(c.rounds.size == 2) { "rounds ${c.rounds}" }
        check(c.rounds[1].prompts[0].first.lowercase().contains("verification"))
        check(!c.rounds[0].prompts[0].second) { "password prompt must not echo" }
    }

    suspend fun authCert() = run("auth.cert") {
        val c = cfg("cert").copy(privateKey = env.keys("id_cert"))
        runCatching { engine.connect(c, cb()) }.onSuccess { error("plain key must be refused") }
        engine.connect(c.copy(certificate = env.keys("id_cert-cert.pub")), cb()).close()
    }

    suspend fun hostKey() = run("hostkey") { d ->
        val s = engine.connect(cfg("pw").copy(password = "termix-pass"), cb())
        val k = s.hostKey
        d["type"] = k.keyType
        d["certificate"] = k.isCertificate
        d["algorithms"] = s.algorithms.joinToString(" ")
        check(k.sha256.startsWith("SHA256:"))
        val hostPub = env.keys("host_ed25519.pub").trim().split(" ")[1]
        val blob = java.util.Base64.getDecoder().decode(hostPub)
        if (k.keyType.startsWith("ssh-ed25519")) check(k.blobHex == hex(blob)) { "blob ${k.blobHex}" }
        s.close()
        val r = cb(reject = true)
        expectFailure(FailureKind.HOSTKEY_REJECTED) { engine.connect(cfg("pw").copy(password = "termix-pass"), r) }
        check(r.rounds.isEmpty())
    }

    suspend fun shellAndExec() = run("shell+exec") {
        val s = engine.connect(keyCfg(), cb())
        val out = Collector()
        val sh = s.openShell("xterm-256color", 80, 24, mapOf("LANG" to "C.UTF-8"), out)
        sh.write("stty size; echo \$TERM\n".toByteArray())
        check(out.waitFor("24 80")) { out.text() }
        check(out.waitFor("xterm-256color"))
        sh.resize(120, 40)
        delay(200)
        sh.write("stty size\n".toByteArray())
        check(out.waitFor("40 120")) { out.text() }
        sh.write("exit 0\n".toByteArray())
        val end = System.currentTimeMillis() + 5000
        while (!out.exited && System.currentTimeMillis() < end) delay(50)
        check(out.exited && out.exit == 0) { "exit ${out.exit}" }
        val r = s.exec("echo out; echo err >&2; exit 3")
        check(String(r.stdout).trim() == "out" && String(r.stderr).trim() == "err" && r.exitCode == 3)
        s.close()
    }

    suspend fun sftpBig() = run("sftp.500mb") { d ->
        val s = engine.connect(keyCfg(), cb())
        val want = text(s, "cat ${env.bigFile.substringBeforeLast('/')}/big.sha256")
        check(s.list("/data").any { it.name == "big.bin" })
        val local = File(env.tempDir, "big.bin")
        val base = env.memory()
        val peak = AtomicLong(base)
        val sampling = AtomicBoolean(true)
        val sampler = CoroutineScope(Dispatchers.Default).launch {
            while (sampling.get()) {
                peak.accumulateAndGet(env.memory()) { a, b -> maxOf(a, b) }
                delay(50)
            }
        }
        var progressCalls = 0
        val down = s.download(env.bigFile, local.absolutePath) { _, _ -> progressCalls++ }
        val up = s.upload(local.absolutePath, "/home/key/up.bin")
        sampling.set(false)
        sampler.join()
        val md = MessageDigest.getInstance("SHA-256")
        withContext(Dispatchers.IO) {
            local.inputStream().use { i ->
                val b = ByteArray(1 shl 20)
                while (true) { val n = i.read(b); if (n < 0) break; md.update(b, 0, n) }
            }
        }
        check(hex(md.digest()) == want) { "download hash" }
        check(text(s, "sha256sum /home/key/up.bin | cut -d' ' -f1") == want) { "upload hash" }
        s.remove("/home/key/up.bin")
        local.delete()
        val mb = down.bytes / 1048576.0
        d["mb"] = mb
        d["down_mbps"] = mb / (down.millis.coerceAtLeast(1) / 1000.0)
        d["up_mbps"] = up.bytes / 1048576.0 / (up.millis.coerceAtLeast(1) / 1000.0)
        d["peak_growth_mb"] = (peak.get() - base) / 1048576.0
        d["progress_calls"] = progressCalls
        check(peak.get() - base < 64L * 1048576) { "memory grew ${(peak.get() - base) / 1048576} MB" }
        s.close()
    }

    suspend fun forwards() = run("forward.local+socks") {
        val s = engine.connect(keyCfg(), cb())
        val f = s.forwardLocal(0, "127.0.0.1", 7000)
        withContext(Dispatchers.IO) {
            Socket("127.0.0.1", f.port).use { sock ->
                sock.getOutputStream().write("ping\n".toByteArray())
                val b = ByteArray(5)
                var got = 0
                while (got < 5) got += sock.getInputStream().read(b, got, 5 - got)
                check(String(b) == "ping\n")
            }
        }
        f.close()
        val socks = s.forwardDynamic(0)
        withContext(Dispatchers.IO) {
            Socket("127.0.0.1", socks.port).use { sock ->
                val o = sock.getOutputStream()
                val i = sock.getInputStream()
                o.write(byteArrayOf(5, 1, 0))
                check(i.read() == 5 && i.read() == 0)
                val name = "localhost".toByteArray()
                o.write(byteArrayOf(5, 1, 0, 3, name.size.toByte()) + name + byteArrayOf(0x1f, 0x90.toByte()))
                val rep = ByteArray(10)
                var got = 0
                while (got < 10) got += i.read(rep, got, 10 - got)
                check(rep[1].toInt() == 0) { "socks reply ${rep[1]}" }
                o.write("GET /hello.txt HTTP/1.0\r\nHost: localhost\r\n\r\n".toByteArray())
                val body = i.readBytes().toString(Charsets.UTF_8)
                check(body.contains("hello from termix")) { body }
            }
        }
        socks.close()
        s.close()
    }

    suspend fun jump() = run("jump") { d ->
        val j = engine.connect(cfg("key", env.jumpPort).copy(privateKey = env.keys("id_ed25519")), cb())
        val start = System.currentTimeMillis()
        val t = j.connectVia(SshConfig(env.jumpTarget, 22, "pw", password = "termix-pass"), cb())
        d["hop_ms"] = System.currentTimeMillis() - start
        check(text(t, "test -f /data/big.bin && echo yes") == "yes")
        check(t.list("/data").isNotEmpty())
        t.close()
        j.close()
    }

    suspend fun keepaliveDrop() = run("keepalive.drop") { d ->
        FreezableRelay(env.host, env.targetPort).use { relay ->
            val c = cb()
            val s = engine.connect(
                SshConfig("127.0.0.1", relay.port, "key", privateKey = env.keys("id_ed25519"),
                    keepaliveIntervalSecs = 2, keepaliveCountMax = 2),
                c,
            )
            val out = Collector()
            s.openShell("xterm", 80, 24, emptyMap(), out)
            relay.frozen.set(true)
            val start = System.currentTimeMillis()
            while (c.disconnects.isEmpty() && System.currentTimeMillis() - start < 30_000) delay(100)
            d["detect_s"] = (System.currentTimeMillis() - start) / 1000.0
            d["reason"] = c.disconnects.firstOrNull()?.second
            check(c.disconnects.isNotEmpty()) { "no disconnect in 30s" }
            check(s.isClosed)
        }
        engine.connect(keyCfg(), cb()).close()
    }

    suspend fun algorithms(): List<ScenarioResult> {
        val entries = Regex("\"id\":\\s*\"([^\"]+)\"[^}]*?\"legacy\":\\s*(true|false)[^}]*?\"port\":\\s*(\\d+)")
            .findAll(env.algosJson).map { Triple(it.groupValues[1], it.groupValues[2] == "true", it.groupValues[3].toInt()) }
            .toList()
        check(entries.isNotEmpty()) { "algos.json parse" }
        return entries.map { (id, legacy, port) ->
            run("algo.$id") { d ->
                val c = cfg("pw", port).copy(password = "termix-pass", allowLegacyAlgorithms = true)
                engine.connect(c, cb()).close()
                if (legacy) d["blocked_when_off"] = runCatching { engine.connect(c.copy(allowLegacyAlgorithms = false), cb()) }.isFailure
            }
        }
    }

    suspend fun all(): List<ScenarioResult> {
        val r = mutableListOf<ScenarioResult>()
        r += authPassword()
        for (k in listOf("id_ed25519", "id_rsa", "id_ecdsa256", "id_ecdsa384", "id_ecdsa521", "id_rsa.ppk", "id_ed25519.ppk")) r += authKey(k)
        r += authKeyPassphrase()
        r += authKeyThenPassword()
        r += authKbd()
        r += authCert()
        r += hostKey()
        r += shellAndExec()
        r += sftpBig()
        r += forwards()
        r += jump()
        r += keepaliveDrop()
        r += algorithms()
        return r
    }
}

/** Scenarios that must pass for a slice to count as working. Algorithm rows and PPK are reported, not required. */
fun ScenarioResult.required() = !name.startsWith("algo.") && !name.endsWith(".ppk")
