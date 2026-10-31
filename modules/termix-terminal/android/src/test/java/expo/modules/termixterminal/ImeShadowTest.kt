package expo.modules.termixterminal

import expo.modules.termixterminal.ImeShadow.Edit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ImeShadowTest {
  @Test
  fun plainKeysGoOutOneByOne() {
    val ime = ImeShadow()
    assertEquals(Edit(0, "l"), ime.commit("l"))
    assertEquals(Edit(0, "s"), ime.commit("s"))
    assertEquals(Edit(0, " "), ime.commit(" "))
    assertEquals(Edit(0, "="), ime.commit("="))
    assertEquals("ls =", ime.textBeforeCursor(10))
  }

  @Test
  fun latinCompositionIsTypedLive() {
    val ime = ImeShadow()
    assertEquals(Edit(0, "h"), ime.setComposing("h", holdBack = false))
    assertEquals(Edit(0, "e"), ime.setComposing("he", holdBack = false))
    assertEquals(Edit(0, "y"), ime.setComposing("hey", holdBack = false))
    // Committing the same word sends nothing more.
    assertEquals(Edit.NONE, ime.commit("hey"))
    assertEquals(Edit(0, " "), ime.commit(" "))
  }

  @Test
  fun aCorrectionBecomesBackspacesAndTheNewTail() {
    val ime = ImeShadow()
    ime.setComposing("teh", holdBack = false)
    assertEquals(Edit(2, "he"), ime.commit("the"))
  }

  @Test
  fun dictationReplacingAPhrase() {
    val ime = ImeShadow()
    ime.setComposing("list the", holdBack = false)
    assertEquals(Edit(3, "files"), ime.setComposing("list files", holdBack = false))
    assertEquals(Edit.NONE, ime.finishComposing())
  }

  @Test
  fun japaneseStaysPreeditUntilCommitted() {
    val ime = ImeShadow()
    assertEquals(Edit.NONE, ime.setComposing("か", holdBack = true))
    assertEquals("か", ime.preedit)
    assertEquals(Edit.NONE, ime.setComposing("かん", holdBack = true))
    assertEquals(Edit(0, "漢"), ime.commit("漢"))
    assertEquals("", ime.preedit)
  }

  @Test
  fun switchingToPreeditTakesBackWhatWasTyped() {
    val ime = ImeShadow()
    ime.setComposing("ka", holdBack = false)
    assertEquals(Edit(2, ""), ime.setComposing("か", holdBack = true))
  }

  @Test
  fun deletesAlwaysReachTheShell() {
    val ime = ImeShadow()
    ime.commit("ab")
    assertEquals(Edit(3, ""), ime.deleteBefore(3))
    assertEquals("", ime.textBeforeCursor(10))
  }

  @Test
  fun deleteInsideACompositionUpdatesIt() {
    val ime = ImeShadow()
    ime.setComposing("abc", holdBack = false)
    assertEquals(Edit(1, ""), ime.deleteBefore(1))
    assertTrue(ime.hasComposing())
  }

  @Test
  fun emojiCountAsOneBackspace() {
    val ime = ImeShadow()
    ime.setComposing("a😀", holdBack = false)
    assertEquals(Edit(1, "😃"), ime.setComposing("a😃", holdBack = false))
  }

  @Test
  fun enterForgetsTheLine() {
    val ime = ImeShadow()
    ime.commit("ls")
    ime.commit("\n")
    assertEquals("", ime.textBeforeCursor(10))
  }

  @Test
  fun preeditNeededForCjkOnly() {
    assertTrue(ImeShadow.needsPreedit("漢字", cjkKeyboard = false))
    assertTrue(ImeShadow.needsPreedit("ka", cjkKeyboard = true))
    assertFalse(ImeShadow.needsPreedit("hello", cjkKeyboard = false))
    assertFalse(ImeShadow.needsPreedit("héllo", cjkKeyboard = false))
  }
}
