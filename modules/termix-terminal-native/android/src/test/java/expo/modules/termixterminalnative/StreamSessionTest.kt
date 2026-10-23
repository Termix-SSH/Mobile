package expo.modules.termixterminalnative

import com.termux.terminal.TerminalSession
import com.termux.terminal.TerminalSessionClient
import java.io.ByteArrayOutputStream
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

internal open class QuietClient : TerminalSessionClient {
  var textChanges = 0
  var bells = 0
  var finished = false

  override fun onTextChanged(changedSession: TerminalSession) { textChanges++ }
  override fun onTitleChanged(changedSession: TerminalSession) {}
  override fun onSessionFinished(finishedSession: TerminalSession) { finished = true }
  override fun onCopyTextToClipboard(session: TerminalSession, text: String) {}
  override fun onPasteTextFromClipboard(session: TerminalSession?) {}
  override fun onBell(session: TerminalSession) { bells++ }
  override fun onColorsChanged(session: TerminalSession) {}
  override fun onTerminalCursorStateChange(state: Boolean) {}
  override fun getTerminalCursorStyle(): Int? = null
  override fun logError(tag: String?, message: String?) {}
  override fun logWarn(tag: String?, message: String?) {}
  override fun logInfo(tag: String?, message: String?) {}
  override fun logDebug(tag: String?, message: String?) {}
  override fun logVerbose(tag: String?, message: String?) {}
  override fun logStackTraceWithMessage(tag: String?, message: String?, e: Exception?) {}
  override fun logStackTrace(tag: String?, e: Exception?) {}
}

internal class RecordingSink : TerminalSession.Sink {
  val input = ByteArrayOutputStream()
  var size: Pair<Int, Int>? = null

  override fun onInput(data: ByteArray, offset: Int, count: Int) {
    input.write(data, offset, count)
  }

  override fun onResize(columns: Int, rows: Int) {
    size = columns to rows
  }
}

class StreamSessionTest {
  private fun session(client: QuietClient = QuietClient(), sink: RecordingSink = RecordingSink()) =
    TerminalSession(1000, client, sink).also { it.updateSize(80, 24, 8, 16) }

  @Test
  fun feedDrawsTextAndNotifies() {
    val client = QuietClient()
    val s = session(client)
    val bytes = "hello \u001b[1mworld\u001b[0m\r\n".toByteArray()
    s.feed(bytes, bytes.size)
    assertTrue(s.emulator.screen.transcriptText.startsWith("hello world"))
    assertEquals(1, client.textChanges)
  }

  @Test
  fun keysGoToTheSink() {
    val sink = RecordingSink()
    val s = session(sink = sink)
    s.write("ls\r")
    s.writeCodePoint(true, 'x'.code)
    s.writeCodePoint(false, 0x65e5)
    assertEquals("ls\r\u001bx日", sink.input.toString(Charsets.UTF_8.name()))
  }

  @Test
  fun resizeReachesTheSink() {
    val sink = RecordingSink()
    val s = session(sink = sink)
    assertEquals(80 to 24, sink.size)
    s.updateSize(100, 30, 8, 16)
    assertEquals(100 to 30, sink.size)
    assertEquals(100, s.emulator.mColumns)
  }

  @Test
  fun terminalAnswersQueriesThroughTheSink() {
    val sink = RecordingSink()
    val s = session(sink = sink)
    // Device status report: the emulator answers with the cursor position.
    val dsr = "\u001b[6n".toByteArray()
    s.feed(dsr, dsr.size)
    assertEquals("\u001b[1;1R", sink.input.toString(Charsets.UTF_8.name()))
  }

  @Test
  fun bellReachesTheClient() {
    val client = QuietClient()
    val s = session(client)
    s.feed(byteArrayOf(7), 1)
    assertEquals(1, client.bells)
  }

  @Test
  fun finishStopsInput() {
    val client = QuietClient()
    val sink = RecordingSink()
    val s = session(client, sink)
    s.finish()
    s.write("x")
    assertTrue(client.finished)
    assertFalse(s.isRunning)
    assertEquals(0, sink.input.size())
  }

  @Test
  fun wideCharactersTakeTwoCells() {
    val s = session()
    val bytes = "日本".toByteArray()
    s.feed(bytes, bytes.size)
    assertEquals(4, s.emulator.cursorCol)
  }

  /** Parser throughput, run by CI with TERMINAL_BENCH_FIXTURES set. */
  @Test
  fun parserBench() {
    val dir = System.getenv("TERMINAL_BENCH_FIXTURES") ?: return
    val files = File(dir).listFiles { f -> f.name.endsWith(".bin") }?.sortedBy { it.name } ?: return
    for (file in files) {
      val data = file.readBytes()
      fun run(len: Int): Double {
        val s = TerminalSession(10_000, QuietClient(), RecordingSink())
        s.updateSize(120, 40, 8, 16)
        val chunk = 64 * 1024
        val start = System.nanoTime()
        var i = 0
        while (i < len) {
          val n = minOf(chunk, len - i)
          s.feed(data.copyOfRange(i, i + n), n)
          i += n
        }
        return (System.nanoTime() - start) / 1e6
      }
      run(minOf(data.size, 1 shl 20))
      val ms = run(data.size)
      val mb = data.size / 1048576.0
      val rt = Runtime.getRuntime()
      val line = (
        "TXBENCH {\"engine\":\"termux\",\"fixture\":\"${file.name}\",\"mb\":${"%.1f".format(mb)}," +
          "\"ms\":${ms.toLong()},\"mbps\":${"%.1f".format(mb / (ms / 1000))}," +
          "\"rssMb\":${(rt.totalMemory() - rt.freeMemory()) / 1048576}}"
      )
      println(line)
      System.getenv("TERMINAL_BENCH_OUT")?.let { File(it).appendText(line + "\n") }
    }
  }
}
