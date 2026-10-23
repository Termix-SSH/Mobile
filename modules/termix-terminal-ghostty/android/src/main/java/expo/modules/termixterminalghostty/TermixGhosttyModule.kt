package expo.modules.termixterminalghostty

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class TermixGhosttyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TermixTerminalGhostty")

    View(TermixGhosttyView::class) {
      Events("onInput", "onResize", "onBell", "onTitleChange")

      Prop("fontSize") { view: TermixGhosttyView, size: Float ->
        view.setFontSize(size)
      }

      Prop("theme") { view: TermixGhosttyView, theme: TerminalThemeRecord? ->
        view.setTheme(theme)
      }

      AsyncFunction("write") { view: TermixGhosttyView, base64: String ->
        val data = try {
          Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
          throw InvalidBase64Exception(e)
        }
        view.write(data)
      }

      AsyncFunction("paste") { view: TermixGhosttyView, text: String -> view.paste(text) }
      AsyncFunction("scrollToBottom") { view: TermixGhosttyView -> view.scrollToBottom() }
      AsyncFunction("copySelection") { view: TermixGhosttyView -> view.copySelection() }
      AsyncFunction("focus") { view: TermixGhosttyView -> view.focusTerminal() }
      AsyncFunction("blur") { view: TermixGhosttyView -> view.blurTerminal() }
      AsyncFunction("getStats") { view: TermixGhosttyView -> view.stats() }

      OnViewDestroys { view: TermixGhosttyView -> view.destroy() }
    }
  }
}

internal class InvalidBase64Exception(cause: Throwable) :
  CodedException("expected base64 terminal output", cause)

internal class TerminalThemeRecord : Record {
  @Field val background: String? = null
  @Field val foreground: String? = null
  @Field val cursorColor: String? = null
  @Field val selectionBackground: String? = null
  @Field val selectionForeground: String? = null
  @Field val palette: List<String?>? = null
}
