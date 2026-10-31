package expo.modules.termixterminal

import org.junit.Assert.assertEquals
import org.junit.Test

class OutputAnnouncerTest {
  @Test
  fun readsLinesAddedBelowThePrompt() {
    val before = listOf("$ ls", "")
    val now = listOf("$ ls", "a.txt  b.txt", "$")
    assertEquals(listOf("a.txt  b.txt", "$"), OutputAnnouncer.newLines(before, now))
  }

  @Test
  fun followsTheScreenWhenItScrolls() {
    val before = (1..24).map { "line $it" }
    val now = (4..27).map { "line $it" }
    assertEquals(listOf("line 25", "line 26", "line 27"), OutputAnnouncer.newLines(before, now))
  }

  @Test
  fun skipsTheEchoOfOneKey() {
    assertEquals(emptyList<String>(), OutputAnnouncer.newLines(listOf("$ l"), listOf("$ ls")))
  }

  @Test
  fun readsWhatGrewOnTheLastLine() {
    assertEquals(listOf("done"), OutputAnnouncer.newLines(listOf("build:"), listOf("build: done")))
  }

  @Test
  fun capsAFreshScreen() {
    val now = (1..20).map { "row $it" }
    assertEquals((16..20).map { "row $it" }, OutputAnnouncer.newLines(listOf("other"), now))
  }

  @Test
  fun nothingWhenUnchanged() {
    assertEquals(emptyList<String>(), OutputAnnouncer.newLines(listOf("a"), listOf("a ")))
  }
}
