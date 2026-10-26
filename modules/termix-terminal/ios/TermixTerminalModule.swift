import ExpoModulesCore

public class TermixTerminalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TermixTerminal")

    Constant("engineLoaded") { true }

    View(TermixTerminalView.self) {
      Events(
        "onInput", "onResize", "onBell", "onTitleChange", "onScrollState", "onLink", "onCopy",
        "onClipboardRequest", "onFontSize", "onModifiers", "onPromptLine",
        "onSearch", "onMenu", "onShortcut"
      )

      Prop("pipeId") { (view: TermixTerminalView, id: String?) in
        view.setPipe(id)
      }

      Prop("fontSize") { (view: TermixTerminalView, size: Float?) in
        view.setFontSize(size)
      }

      Prop("fontFamily") { (view: TermixTerminalView, family: String?) in
        view.update { $0.fontFamily = family ?? "CaskaydiaCove NFM" }
      }

      Prop("lineHeight") { (view: TermixTerminalView, value: Double?) in
        view.update { $0.lineHeight = value ?? 1 }
      }

      Prop("letterSpacing") { (view: TermixTerminalView, value: Double?) in
        view.update { $0.letterSpacing = value ?? 0 }
      }

      Prop("cursor") { (view: TermixTerminalView, cursor: CursorRecord?) in
        view.update {
          $0.cursorStyle = cursor?.style ?? "block"
          $0.cursorBlink = cursor?.blink ?? true
        }
      }

      Prop("scrollback") { (view: TermixTerminalView, lines: Int?) in
        view.update { $0.scrollback = lines ?? 10_000 }
      }

      Prop("bell") { (view: TermixTerminalView, bell: BellRecord?) in
        view.update {
          $0.bellStyle = bell?.style ?? "none"
          $0.haptics = bell?.haptics ?? true
        }
      }

      Prop("optionAsMeta") { (view: TermixTerminalView, value: Bool?) in
        view.update { $0.optionAsMeta = value ?? false }
      }

      Prop("accentColor") { (view: TermixTerminalView, color: String?) in
        view.setAccentColor(color)
      }

      Prop("watchPrompt") { (view: TermixTerminalView, on: Bool?) in
        view.promptWatch = on ?? false
      }

      Prop("theme") { (view: TermixTerminalView, theme: TerminalThemeRecord?) in
        view.update { config in
          config.theme = theme.map {
            TermixTerminalView.ThemeColors(
              background: $0.background,
              foreground: $0.foreground,
              cursorColor: $0.cursorColor,
              cursorAccent: $0.cursorAccent,
              selectionBackground: $0.selectionBackground,
              selectionForeground: $0.selectionForeground,
              palette: $0.palette ?? []
            )
          }
        }
      }

      AsyncFunction("write") { (view: TermixTerminalView, base64: String) in
        guard let data = Data(base64Encoded: base64) else {
          throw InvalidBase64Exception()
        }
        view.write(data)
      }.runOnQueue(.main)

      AsyncFunction("paste") { (view: TermixTerminalView, text: String) in
        view.paste(text)
      }.runOnQueue(.main)

      AsyncFunction("scrollToBottom") { (view: TermixTerminalView) in
        view.scrollToBottom()
      }.runOnQueue(.main)

      AsyncFunction("copySelection") { (view: TermixTerminalView) in
        view.copySelection()
      }.runOnQueue(.main)

      AsyncFunction("selectAll") { (view: TermixTerminalView) in
        view.selectAll()
      }.runOnQueue(.main)

      // Ghostty searches plain text; the options are Android only.
      AsyncFunction("search") { (view: TermixTerminalView, query: String, _: SearchRecord) in
        view.search(query)
      }.runOnQueue(.main)

      AsyncFunction("searchNext") { (view: TermixTerminalView) in
        view.searchStep(forward: true)
      }.runOnQueue(.main)

      AsyncFunction("searchPrevious") { (view: TermixTerminalView) in
        view.searchStep(forward: false)
      }.runOnQueue(.main)

      AsyncFunction("clearSearch") { (view: TermixTerminalView) in
        view.clearSearch()
      }.runOnQueue(.main)

      AsyncFunction("focus") { (view: TermixTerminalView) in
        view.focusTerminal()
      }.runOnQueue(.main)

      AsyncFunction("blur") { (view: TermixTerminalView) in
        view.blurTerminal()
      }.runOnQueue(.main)

      AsyncFunction("toggleModifier") { (view: TermixTerminalView, name: String) in
        view.toggleModifier(name)
      }.runOnQueue(.main)

      AsyncFunction("sendKey") { (view: TermixTerminalView, name: String, shift: Bool) in
        view.sendKey(name, shift: shift)
      }.runOnQueue(.main)

      AsyncFunction("typeText") { (view: TermixTerminalView, text: String) in
        view.typeText(text)
      }.runOnQueue(.main)

      AsyncFunction("answerClipboard") { (view: TermixTerminalView, id: Int, allow: Bool) in
        view.answerClipboard(id, allow: allow)
      }.runOnQueue(.main)

      AsyncFunction("getStats") { (view: TermixTerminalView) -> [String: Double] in
        view.stats()
      }.runOnQueue(.main)
    }
  }
}

internal final class InvalidBase64Exception: Exception {
  override var reason: String {
    "expected base64 terminal output"
  }
}

internal struct TerminalThemeRecord: Record {
  @Field var background: String?
  @Field var foreground: String?
  @Field var cursorColor: String?
  @Field var cursorAccent: String?
  @Field var selectionBackground: String?
  @Field var selectionForeground: String?
  @Field var palette: [String?]?
}

internal struct CursorRecord: Record {
  @Field var style: String?
  @Field var blink: Bool = true
}

internal struct SearchRecord: Record {
  @Field var caseSensitive: Bool = false
  @Field var wholeWord: Bool = false
  @Field var regex: Bool = false
}

internal struct BellRecord: Record {
  @Field var style: String?
  @Field var haptics: Bool = true
}
