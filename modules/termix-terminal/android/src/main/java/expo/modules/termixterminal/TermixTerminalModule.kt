package expo.modules.termixterminal

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class TermixTerminalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TermixTerminal")

    Constant("engineLoaded") { GhosttyVt.loaded }

    View(TermixTerminalView::class) {
      Events(
        "onInput", "onResize", "onBell", "onTitleChange", "onScrollState", "onLink", "onCopy",
        "onClipboardRequest", "onFontSize", "onModifiers", "onPromptLine",
        "onSearch", "onMenu", "onShortcut"
      )

      Prop("pipeId") { view: TermixTerminalView, id: String? -> view.setPipe(id) }
      Prop("fontSize") { view: TermixTerminalView, size: Float? -> size?.let { view.setFontSize(it) } }
      Prop("fontFamily") { view: TermixTerminalView, family: String? -> view.setFontFamily(family) }
      Prop("lineHeight") { view: TermixTerminalView, value: Float? -> view.setLineHeight(value ?: 1f) }
      Prop("letterSpacing") { view: TermixTerminalView, value: Float? -> view.setLetterSpacing(value ?: 0f) }
      Prop("cursor") { view: TermixTerminalView, cursor: CursorRecord? ->
        view.setCursor(cursor?.style, cursor?.blink ?: true)
      }
      Prop("scrollback") { view: TermixTerminalView, lines: Int? -> lines?.let { view.setScrollback(it) } }
      Prop("bell") { view: TermixTerminalView, bell: BellRecord? ->
        view.setBell(bell?.style, bell?.haptics ?: true)
      }
      Prop("accentColor") { view: TermixTerminalView, color: String? -> view.setAccentColor(color) }
      Prop("watchPrompt") { view: TermixTerminalView, on: Boolean? -> view.setPromptWatch(on == true) }
      // iOS only: a hidden iOS surface stops drawing. Android draws on demand.
      Prop("surfaceVisible") { _: TermixTerminalView, _: Boolean? -> }
      // iOS only; Android reads Alt from the keyboard itself.
      Prop("optionAsMeta") { _: TermixTerminalView, _: Boolean? -> }

      Prop("theme") { view: TermixTerminalView, theme: TerminalThemeRecord? ->
        view.setTheme(theme)
      }

      AsyncFunction("write") { view: TermixTerminalView, base64: String ->
        val data = try {
          Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
          throw InvalidBase64Exception(e)
        }
        view.write(data)
      }

      // iOS only: the Android view sizes itself on every layout.
      AsyncFunction("refit") { _: TermixTerminalView -> }
      AsyncFunction("paste") { view: TermixTerminalView, text: String -> view.paste(text) }
      AsyncFunction("scrollToBottom") { view: TermixTerminalView -> view.scrollToBottom() }
      AsyncFunction("copySelection") { view: TermixTerminalView -> view.copySelection() }
      AsyncFunction("selectAll") { view: TermixTerminalView -> view.selectAll() }
      AsyncFunction("search") { view: TermixTerminalView, query: String, options: SearchRecord ->
        view.search(query, options.caseSensitive, options.wholeWord, options.regex)
      }
      AsyncFunction("searchNext") { view: TermixTerminalView -> view.searchStep(true) }
      AsyncFunction("searchPrevious") { view: TermixTerminalView -> view.searchStep(false) }
      AsyncFunction("clearSearch") { view: TermixTerminalView -> view.clearSearch() }
      AsyncFunction("focus") { view: TermixTerminalView -> view.focusTerminal() }
      AsyncFunction("blur") { view: TermixTerminalView -> view.blurTerminal() }
      AsyncFunction("toggleModifier") { view: TermixTerminalView, name: String -> view.toggleModifier(name) }
      AsyncFunction("sendKey") { view: TermixTerminalView, name: String, shift: Boolean -> view.sendKey(name, shift) }
      AsyncFunction("typeText") { view: TermixTerminalView, text: String -> view.typeText(text) }
      AsyncFunction("answerClipboard") { view: TermixTerminalView, id: Int, allow: Boolean ->
        view.answerClipboard(id, allow)
      }
      AsyncFunction("getStats") { view: TermixTerminalView -> view.stats() }

      OnViewDestroys { view: TermixTerminalView -> view.destroy() }
    }
  }
}

internal class InvalidBase64Exception(cause: Throwable) :
  CodedException("expected base64 terminal output", cause)

internal class TerminalThemeRecord : Record {
  @Field val background: String? = null
  @Field val foreground: String? = null
  @Field val cursorColor: String? = null
  @Field val cursorAccent: String? = null
  @Field val selectionBackground: String? = null
  @Field val selectionForeground: String? = null
  @Field val palette: List<String?>? = null
}

internal class CursorRecord : Record {
  @Field val style: String? = null
  @Field val blink: Boolean = true
}

internal class SearchRecord : Record {
  @Field val caseSensitive: Boolean = false
  @Field val wholeWord: Boolean = false
  @Field val regex: Boolean = false
}

internal class BellRecord : Record {
  @Field val style: String? = null
  @Field val haptics: Boolean = true
}
