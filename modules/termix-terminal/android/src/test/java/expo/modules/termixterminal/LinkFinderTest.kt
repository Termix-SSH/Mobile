package expo.modules.termixterminal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LinkFinderTest {
  @Test
  fun findsTheAddressUnderTheTap() {
    val line = "see https://termix.site/docs for more"
    assertEquals("https://termix.site/docs", LinkFinder.findInText(line, 4))
    assertEquals("https://termix.site/docs", LinkFinder.findInText(line, 27))
    assertNull(LinkFinder.findInText(line, 2))
    assertNull(LinkFinder.findInText(line, 29))
  }

  @Test
  fun dropsSentencePunctuation() {
    assertEquals("http://a.b/c", LinkFinder.findInText("go to http://a.b/c.", 8))
    assertEquals("http://a.b/c", LinkFinder.findInText("(http://a.b/c)", 3))
  }

  @Test
  fun keepsBracketsThatBelongToTheAddress() {
    val url = "https://en.wikipedia.org/wiki/Bash_(Unix_shell)"
    assertEquals(url, LinkFinder.findInText(url, 5))
  }

  @Test
  fun addsHttpsToWww() {
    assertEquals("https://www.termix.site", LinkFinder.findInText("www.termix.site", 0))
  }

  @Test
  fun wideCharactersTakeTwoColumns() {
    // "日" fills columns 0 and 1, so the address starts at column 3.
    val cells = listOf("日", "", " ") + "https://x.y".map { it.toString() }
    assertEquals("https://x.y", LinkFinder.find(cells, 3))
    assertNull(LinkFinder.find(cells, 1))
  }
}
