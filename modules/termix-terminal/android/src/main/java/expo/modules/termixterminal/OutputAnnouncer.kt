package expo.modules.termixterminal

/**
 * Picks the new lines a screen reader should read after output changed the screen. iOS has the
 * same rules in TermixTerminalView.swift.
 */
internal object OutputAnnouncer {
  const val MAX_LINES = 5

  /** Lines in [now] after the last lines of [before], or the last few when they scrolled away. */
  fun newLines(before: List<String>, now: List<String>): List<String> {
    val current = now.map { it.trimEnd() }.filter { it.isNotBlank() }
    if (current.isEmpty()) return emptyList()
    val previous = before.map { it.trimEnd() }.filter { it.isNotBlank() }
    if (previous == current) return emptyList()
    // Only the last line changed: read what was added, but not the echo of one typed key.
    if (previous.isNotEmpty() && current.size == previous.size && current.dropLast(1) == previous.dropLast(1)) {
      val old = previous.last()
      val line = current.last()
      val added = (if (line.startsWith(old)) line.substring(old.length) else line).trim()
      return if (added.length <= 1) emptyList() else listOf(added)
    }
    // Longest tail of the old screen that is a run inside the new one.
    for (take in minOf(previous.size, 3) downTo 1) {
      val tail = previous.subList(previous.size - take, previous.size)
      val at = lastIndexOf(current, tail)
      if (at >= 0) return current.subList(at + take, current.size).takeLast(MAX_LINES)
    }
    return current.takeLast(MAX_LINES)
  }

  private fun lastIndexOf(lines: List<String>, run: List<String>): Int {
    for (start in lines.size - run.size downTo 0) {
      var ok = true
      for (i in run.indices) {
        if (lines[start + i] != run[i]) {
          ok = false
          break
        }
      }
      if (ok) return start
    }
    return -1
  }
}
