package termix.ssh.host

import kotlinx.coroutines.runBlocking
import termix.ssh.api.Scenarios
import termix.ssh.api.SshEngine
import termix.ssh.api.TestEnv
import termix.ssh.api.required
import termix.ssh.libssh2.Libssh2Engine
import termix.ssh.russh.RusshEngine
import java.io.File
import kotlin.test.Test
import kotlin.test.fail

class HostScenarioTest {
    private val keys = File(System.getenv("SSH_TEST_KEYS") ?: "../../../server/out")
    private val results = System.getenv("SSH_RESULTS_DIR")?.let { File(it).apply { mkdirs() } }

    private fun rss(): Long = File("/proc/self/status").readLines()
        .first { it.startsWith("VmRSS:") }.split(Regex("\\s+"))[1].toLong() * 1024

    private fun runFor(engine: SshEngine) = runBlocking {
        val tmp = kotlin.io.path.createTempDirectory("termix-ssh").toFile()
        val env = TestEnv(
            host = System.getenv("SSH_TEST_HOST") ?: "127.0.0.1",
            platform = "jvm-linux",
            keys = { File(keys, it).readText() },
            algosJson = File("../../../server/algos.json").readText(),
            tempDir = tmp,
            memory = ::rss,
            record = { line ->
                println("TXRESULT $line")
                results?.let { File(it, "${engine.name}-jvm.jsonl").appendText(line + "\n") }
            },
        )
        println("engine ${engine.version}")
        val failed = Scenarios(engine, env).all().filter { !it.ok && it.required() }
        tmp.deleteRecursively()
        if (failed.isNotEmpty()) fail(failed.joinToString("\n") { "${it.name}: ${it.error}" })
    }

    private fun wanted(name: String) = System.getenv("SSH_TEST_ENGINES")?.split(",")?.contains(name) ?: true

    @Test fun russh() { if (wanted("russh")) runFor(RusshEngine()) }

    @Test fun libssh2() { if (wanted("libssh2")) runFor(Libssh2Engine()) }
}
