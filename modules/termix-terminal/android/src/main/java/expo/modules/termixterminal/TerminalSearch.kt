package expo.modules.termixterminal

// Finds text in the screen and scrollback, one screen row per line. Columns
// count wide characters as two cells, like the grid.
internal data class SearchHit(val row: Int, val startCol: Int, val endCol: Int)

internal object TerminalSearch {
  fun find(
    lines: List<String>,
    query: String,
    caseSensitive: Boolean,
    wholeWord: Boolean,
    regex: Boolean
  ): List<SearchHit> {
    if (query.isEmpty()) return emptyList()
    val pattern = try {
      val source = if (regex) query else Regex.escape(query)
      val bounded = if (wholeWord) "\\b(?:$source)\\b" else source
      if (caseSensitive) Regex(bounded) else Regex(bounded, RegexOption.IGNORE_CASE)
    } catch (_: Exception) {
      return emptyList()
    }
    val hits = ArrayList<SearchHit>()
    for ((row, line) in lines.withIndex()) {
      for (match in pattern.findAll(line)) {
        if (match.value.isEmpty()) continue
        val start = cellsBefore(line, match.range.first)
        val end = cellsBefore(line, match.range.last + 1) - 1
        hits.add(SearchHit(row, start, maxOf(start, end)))
        if (hits.size >= MAX_HITS) return hits
      }
    }
    return hits
  }

  private fun cellsBefore(line: String, index: Int): Int {
    var cells = 0
    var i = 0
    while (i < index && i < line.length) {
      val cp = line.codePointAt(i)
      cells += if (isWide(cp)) 2 else 1
      i += Character.charCount(cp)
    }
    return cells
  }

  // East Asian wide and emoji blocks.
  private fun isWide(cp: Int): Boolean =
    (cp in 0x1100..0x115F) || (cp in 0x2E80..0xA4CF) || (cp in 0xAC00..0xD7A3) ||
      (cp in 0xF900..0xFAFF) || (cp in 0xFE30..0xFE4F) || (cp in 0xFF00..0xFF60) ||
      (cp in 0xFFE0..0xFFE6) || (cp in 0x1F300..0x1F64F) || (cp in 0x1F900..0x1F9FF) ||
      (cp in 0x20000..0x3FFFD)

  private const val MAX_HITS = 5000
}
