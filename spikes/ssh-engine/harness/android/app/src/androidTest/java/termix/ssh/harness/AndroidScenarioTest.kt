package termix.ssh.harness

import android.os.Debug
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import termix.ssh.api.Collector
import termix.ssh.api.Scenarios
import termix.ssh.api.SshConfig
import termix.ssh.api.SshEngine
import termix.ssh.api.TestCallbacks
import termix.ssh.api.TestEnv
import termix.ssh.api.required
import termix.ssh.libssh2.Libssh2Engine
import termix.ssh.russh.RusshEngine
import java.io.File

@RunWith(AndroidJUnit4::class)
class AndroidScenarioTest {
    private val instr = InstrumentationRegistry.getInstrumentation()
    private val ctx = instr.targetContext
    private val testAssets = instr.context.assets
    private val args = InstrumentationRegistry.getArguments()
    private val host = args.getString("sshHost") ?: "10.0.2.2"

    private fun record(line: String) {
        Log.i("TXRESULT", line)
        ctx.getExternalFilesDir(null)?.let { File(it, "results.jsonl").appendText(line + "\n") }
    }

    private fun env() = TestEnv(
        host = host,
        platform = "android-api${android.os.Build.VERSION.SDK_INT}",
        keys = { name -> testAssets.open("keys/$name").bufferedReader().readText() },
        algosJson = testAssets.open("algos.json").bufferedReader().readText(),
        tempDir = ctx.cacheDir,
        memory = { Debug.getNativeHeapAllocatedSize() },
        record = ::record,
    )

    private fun shell(cmd: String): String {
        val pfd: ParcelFileDescriptor = instr.uiAutomation.executeShellCommand(cmd)
        return ParcelFileDescriptor.AutoCloseInputStream(pfd).bufferedReader().readText()
    }

    private fun wanted(name: String) = args.getString("engines")?.split(",")?.contains(name) ?: true

    private fun suite(engine: SshEngine) = runBlocking {
        record("{\"engine\":\"${engine.name}\",\"platform\":\"android\",\"scenario\":\"version\",\"ok\":true,\"detail\":{\"version\":\"${engine.version}\"}}")
        val failed = Scenarios(engine, env()).all().filter { !it.ok && it.required() }
        if (failed.isNotEmpty()) fail(failed.joinToString("\n") { "${it.name}: ${it.error}" })
    }

    @Test fun russhScenarios() { if (wanted("russh")) suite(RusshEngine()) }

    @Test fun libssh2Scenarios() { if (wanted("libssh2")) suite(Libssh2Engine()) }

    /** Airplane mode while a shell is open: how fast is the drop seen, and does a new login work after. */
    private fun airplane(engine: SshEngine) = runBlocking {
        val e = env()
        val cb = TestCallbacks(e)
        val s = engine.connect(
            SshConfig(host, 2222, "key", privateKey = e.keys("id_ed25519"), keepaliveIntervalSecs = 3, keepaliveCountMax = 2),
            cb,
        )
        s.openShell("xterm", 80, 24, emptyMap(), Collector())
        shell("cmd connectivity airplane-mode enable")
        val start = System.currentTimeMillis()
        while (cb.disconnects.isEmpty() && System.currentTimeMillis() - start < 60_000) delay(200)
        val detect = (System.currentTimeMillis() - start) / 1000.0
        shell("cmd connectivity airplane-mode disable")
        delay(8000)
        val again = runCatching { engine.connect(SshConfig(host, 2222, "key", privateKey = e.keys("id_ed25519")), TestCallbacks(e)).close() }
        val ok = cb.disconnects.isNotEmpty() && again.isSuccess
        record("{\"engine\":\"${engine.name}\",\"platform\":\"android\",\"scenario\":\"network.airplane\",\"ok\":$ok,\"detail\":{\"detect_s\":$detect,\"reconnect\":${again.isSuccess}}}")
        runCatching { s.close() }
        if (!ok) fail("airplane: detect=$detect reconnect=${again.exceptionOrNull()}")
    }

    @Test fun russhAirplane() { if (wanted("russh")) airplane(RusshEngine()) }

    @Test fun libssh2Airplane() { if (wanted("libssh2")) airplane(Libssh2Engine()) }

    /** App in the background under forced Doze for 2 minutes. Recorded, not asserted: it shows what B1 must handle. */
    private fun background(engine: SshEngine) = runBlocking {
        val e = env()
        val cb = TestCallbacks(e)
        val s = engine.connect(
            SshConfig(host, 2222, "key", privateKey = e.keys("id_ed25519"), keepaliveIntervalSecs = 15, keepaliveCountMax = 3),
            cb,
        )
        val out = Collector()
        val sh = s.openShell("xterm", 80, 24, emptyMap(), out)
        shell("input keyevent KEYCODE_HOME")
        shell("dumpsys deviceidle force-idle")
        delay(120_000)
        shell("dumpsys deviceidle unforce")
        val alive = !s.isClosed && cb.disconnects.isEmpty()
        val responds = alive && runCatching {
            sh.write("echo still-here\n".toByteArray())
            out.waitFor("still-here", 10)
        }.getOrDefault(false)
        record("{\"engine\":\"${engine.name}\",\"platform\":\"android\",\"scenario\":\"background.doze2m\",\"ok\":true,\"detail\":{\"alive\":$alive,\"responds\":$responds,\"reason\":\"${cb.disconnects.firstOrNull()?.second ?: ""}\"}}")
        runCatching { s.close() }
    }

    @Test fun russhBackground() { if (wanted("russh")) background(RusshEngine()) }

    @Test fun libssh2Background() { if (wanted("libssh2")) background(Libssh2Engine()) }
}
