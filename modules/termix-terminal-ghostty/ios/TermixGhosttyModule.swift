import ExpoModulesCore

public class TermixGhosttyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TermixTerminalGhostty")

    View(TermixGhosttyView.self) {
      Events("onInput", "onResize", "onBell", "onTitleChange")

      Prop("fontSize") { (view: TermixGhosttyView, size: Float?) in
        view.fontSize = size
      }

      Prop("theme") { (view: TermixGhosttyView, theme: TerminalThemeRecord?) in
        view.applyTheme(theme)
      }

      AsyncFunction("write") { (view: TermixGhosttyView, base64: String) in
        guard let data = Data(base64Encoded: base64) else {
          throw InvalidBase64Exception()
        }
        view.write(data)
      }.runOnQueue(.main)

      AsyncFunction("paste") { (view: TermixGhosttyView, text: String) in
        view.paste(text)
      }.runOnQueue(.main)

      AsyncFunction("scrollToBottom") { (view: TermixGhosttyView) in
        view.scrollToBottom()
      }.runOnQueue(.main)

      AsyncFunction("copySelection") { (view: TermixGhosttyView) in
        view.copySelection()
      }.runOnQueue(.main)

      AsyncFunction("focus") { (view: TermixGhosttyView) in
        view.focusTerminal()
      }.runOnQueue(.main)

      AsyncFunction("blur") { (view: TermixGhosttyView) in
        view.blurTerminal()
      }.runOnQueue(.main)

      AsyncFunction("getStats") { (view: TermixGhosttyView) -> [String: Double] in
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
  @Field var selectionBackground: String?
  @Field var selectionForeground: String?
  @Field var palette: [String?]?
}
