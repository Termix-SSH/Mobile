package expo.modules.termixterminal

/**
 * What the soft keyboard thinks the editor holds, and what was sent to the shell for it.
 *
 * Keyboards edit text: they compose, commit, replace a word after dictation and delete around the
 * cursor. A terminal only takes keystrokes, so every edit becomes backspaces plus new text. Latin
 * composing text goes out as it is typed (a shell needs each key at once); CJK composing text stays
 * on screen as preedit until it is committed.
 */
internal class ImeShadow(private val cap: Int = 256) {
  /** Backspaces to send (in code points), then text. */
  data class Edit(val backspaces: Int, val text: String) {
    val isEmpty: Boolean get() = backspaces == 0 && text.isEmpty()

    companion object {
      val NONE = Edit(0, "")
    }
  }

  private val committed = StringBuilder()
  private var composing = ""
  // The part of [composing] already typed into the shell.
  private var sent = ""

  /** Composing text shown at the cursor and not sent yet, for CJK input. */
  var preedit = ""
    private set

  /** The keyboard replaced the composing region. [holdBack] keeps it as preedit. */
  fun setComposing(text: String, holdBack: Boolean): Edit {
    composing = text
    if (holdBack) {
      val retract = codePoints(sent)
      sent = ""
      preedit = text
      return Edit(retract, "")
    }
    preedit = ""
    val edit = diff(sent, text)
    sent = text
    return edit
  }

  /** Text replaces the composing region, if any, and is final. */
  fun commit(text: String): Edit {
    val edit = diff(sent, text)
    composing = ""
    sent = ""
    preedit = ""
    committed.append(text)
    if (text.contains('\n')) {
      committed.setLength(0)
    } else if (committed.length > cap) {
      committed.delete(0, committed.length - cap)
    }
    return edit
  }

  fun finishComposing(): Edit = if (composing.isEmpty() && preedit.isEmpty()) Edit.NONE else commit(composing)

  /** Deletes [count] code points before the cursor. Always sends them, the shell may hold more. */
  fun deleteBefore(count: Int): Edit {
    if (count <= 0) return Edit.NONE
    if (composing.isNotEmpty()) {
      // Some keyboards delete inside a composition instead of updating it.
      val keep = dropLastCodePoints(composing, count)
      return setComposing(keep, preedit.isNotEmpty())
    }
    var left = count
    while (left > 0 && committed.isNotEmpty()) {
      val end = committed.length
      val start = committed.offsetByCodePoints(end, -1)
      committed.delete(start, end)
      left--
    }
    return Edit(count, "")
  }

  /** What the keyboard reads before the cursor, for its own context. */
  fun textBeforeCursor(max: Int): String {
    val all = committed.toString() + composing
    return if (all.length <= max) all else all.substring(all.length - max)
  }

  fun hasComposing(): Boolean = composing.isNotEmpty()

  /** Forgets the line, after Enter, a hardware key or a new connection. */
  fun reset() {
    committed.setLength(0)
    composing = ""
    sent = ""
    preedit = ""
  }

  companion object {
    /** Backspaces over what differs after the common start, then the new tail. */
    fun diff(old: String, new: String): Edit {
      var i = 0
      val limit = minOf(old.length, new.length)
      while (i < limit && old[i] == new[i]) i++
      // Stopping right after a high surrogate would split a pair.
      if (i > 0 && Character.isHighSurrogate(old[i - 1])) i--
      return Edit(codePoints(old.substring(i)), new.substring(i))
    }

    fun codePoints(text: String): Int = text.codePointCount(0, text.length)

    private fun dropLastCodePoints(text: String, count: Int): String {
      val total = codePoints(text)
      if (count >= total) return ""
      return text.substring(0, text.offsetByCodePoints(0, total - count))
    }

    /** Scripts typed through a candidate window, which must stay preedit until committed. */
    fun needsPreedit(text: String, cjkKeyboard: Boolean): Boolean {
      if (cjkKeyboard) return true
      var i = 0
      while (i < text.length) {
        val cp = text.codePointAt(i)
        val script = Character.UnicodeScript.of(cp)
        if (script == Character.UnicodeScript.HAN ||
          script == Character.UnicodeScript.HIRAGANA ||
          script == Character.UnicodeScript.KATAKANA ||
          script == Character.UnicodeScript.HANGUL ||
          script == Character.UnicodeScript.BOPOMOFO
        ) {
          return true
        }
        i += Character.charCount(cp)
      }
      return false
    }
  }
}
