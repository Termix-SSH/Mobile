import ExpoModulesCore

public class TermixNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TermixTerminalNative")

    View(TermixNativeView.self) {
      Events("onInput", "onResize", "onBell", "onTitleChange")

      Prop("fontSize") { (view: TermixNativeView, size: Double) in
        view.setFontSize(CGFloat(size))
      }

      Prop("theme") { (view: TermixNativeView, theme: NativeThemeRecord?) in
        view.applyTheme(theme)
      }

      AsyncFunction("write") { (view: TermixNativeView, base64: String) in
        guard let data = Data(base64Encoded: base64) else {
          throw InvalidBase64Exception()
        }
        view.write(data)
      }.runOnQueue(.main)

      AsyncFunction("paste") { (view: TermixNativeView, text: String) in
        view.paste(text)
      }.runOnQueue(.main)

      AsyncFunction("scrollToBottom") { (view: TermixNativeView) in
        view.scrollToBottom()
      }.runOnQueue(.main)

      AsyncFunction("copySelection") { (view: TermixNativeView) in
        view.copySelection()
      }.runOnQueue(.main)

      AsyncFunction("focus") { (view: TermixNativeView) in
        view.focusTerminal()
      }.runOnQueue(.main)

      AsyncFunction("blur") { (view: TermixNativeView) in
        view.blurTerminal()
      }.runOnQueue(.main)

      AsyncFunction("getStats") { (view: TermixNativeView) -> [String: Double] in
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

internal struct NativeThemeRecord: Record {
  @Field var background: String?
  @Field var foreground: String?
  @Field var cursorColor: String?
  @Field var selectionBackground: String?
  @Field var palette: [String?]?
}
