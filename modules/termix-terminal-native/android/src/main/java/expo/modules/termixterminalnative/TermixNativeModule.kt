package expo.modules.termixterminalnative

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class TermixNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TermixTerminalNative")

    View(TermixTermuxView::class) {
      Events("onInput", "onResize", "onBell", "onTitleChange")

      Prop("fontSize") { view: TermixTermuxView, size: Float -> view.setFontSize(size) }

      Prop("theme") { view: TermixTermuxView, theme: NativeThemeRecord? -> view.setTheme(theme) }

      AsyncFunction("write") { view: TermixTermuxView, base64: String ->
        val data = try {
          Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
          throw InvalidBase64Exception(e)
        }
        view.write(data)
      }

      AsyncFunction("paste") { view: TermixTermuxView, text: String -> view.paste(text) }
      AsyncFunction("scrollToBottom") { view: TermixTermuxView -> view.scrollToBottom() }
      AsyncFunction("copySelection") { view: TermixTermuxView -> view.copySelection() }
      AsyncFunction("focus") { view: TermixTermuxView -> view.focusTerminal() }
      AsyncFunction("blur") { view: TermixTermuxView -> view.blurTerminal() }
      AsyncFunction("getStats") { view: TermixTermuxView -> view.stats() }

      OnViewDestroys { view: TermixTermuxView -> view.destroy() }
    }
  }
}

internal class InvalidBase64Exception(cause: Throwable) :
  CodedException("expected base64 terminal output", cause)

internal class NativeThemeRecord : Record {
  @Field val background: String? = null
  @Field val foreground: String? = null
  @Field val cursorColor: String? = null
  @Field val selectionBackground: String? = null
  @Field val palette: List<String?>? = null
}
