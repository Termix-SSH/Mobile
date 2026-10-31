package expo.modules.termixterminal

/**
 * Finds a web address under a tapped cell. iOS has the same rules in TermixLinkFinder.swift.
 */
internal object LinkFinder {
  private val URL = Regex(
    "(?:https?|ftp)://[^\\s<>\"'`{}|\\\\^]+|www\\.[^\\s<>\"'`{}|\\\\^]+",
    RegexOption.IGNORE_CASE
  )

  // Punctuation that usually ends a sentence, not the address.
  private const val TRAILING = ".,;:!?'\")]}>"

  /**
   * [cells] holds each cell's text: " " for a blank cell and "" for the second half of a wide
   * character. Returns the address covering [col], or null.
   */
  fun find(cells: List<String>, col: Int): String? {
    if (col < 0 || col >= cells.size) return null
    val text = StringBuilder()
    val cellOfChar = ArrayList<Int>()
    for ((i, cell) in cells.withIndex()) {
      for (ch in cell) cellOfChar.add(i)
      text.append(cell)
    }
    for (match in URL.findAll(text)) {
      var end = match.range.last
      while (end > match.range.first && TRAILING.indexOf(text[end]) >= 0 && !keepsBracket(text, match.range.first, end)) {
        end--
      }
      val first = cellOfChar[match.range.first]
      var last = cellOfChar[end]
      // A wide last character also covers its spacer cell.
      while (last + 1 < cells.size && cells[last + 1].isEmpty()) last++
      if (col in first..last) {
        val url = text.substring(match.range.first, end + 1)
        return if (url.startsWith("www.", ignoreCase = true)) "https://$url" else url
      }
    }
    return null
  }

  /** [find] on plain text where every character is one column. */
  fun findInText(line: String, col: Int): String? = find(line.map { it.toString() }, col)

  // Keeps a closing bracket that matches one inside the address, like a wiki link.
  private fun keepsBracket(text: CharSequence, start: Int, end: Int): Boolean {
    val open = when (text[end]) {
      ')' -> '('
      ']' -> '['
      '}' -> '{'
      else -> return false
    }
    var opens = 0
    var closes = 0
    for (i in start..end) {
      if (text[i] == open) opens++
      if (text[i] == text[end]) closes++
    }
    return opens >= closes
  }
}
