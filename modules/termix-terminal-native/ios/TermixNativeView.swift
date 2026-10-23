import ExpoModulesCore
import SwiftTerm
import UIKit

// SwiftTerm view fed from JS. Output arrives through write, key input leaves
// through onInput.
class TermixNativeView: ExpoView {
  // The app embeds CaskaydiaCove through the expo-font config plugin.
  private static let fontName = "CaskaydiaCoveNFM-Regular"

  private let terminalView: TerminalView
  private var fontSize: CGFloat = 14
  private var bytesParsed: Double = 0

  let onInput = EventDispatcher()
  let onResize = EventDispatcher()
  let onBell = EventDispatcher()
  let onTitleChange = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    // SwiftTerm keeps frame timings only when this is set before first use.
    setenv("SWIFTTERM_PROFILE_STATS", "1", 0)
    terminalView = TerminalView(frame: .zero, font: Self.font(size: 14))
    super.init(appContext: appContext)
    clipsToBounds = true
    terminalView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    terminalView.terminalDelegate = self
    // The app draws its own accessory row.
    terminalView.inputAccessoryView = nil
    terminalView.optionAsMetaKey = true
    try? terminalView.setUseMetal(true)
    terminalView.addGestureRecognizer(
      UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:))))
    addSubview(terminalView)
  }

  private static func font(size: CGFloat) -> UIFont {
    UIFont(name: fontName, size: size) ?? .monospacedSystemFont(ofSize: size, weight: .regular)
  }

  func setFontSize(_ size: CGFloat) {
    let clamped = min(max(size, 6), 40)
    guard clamped != fontSize else { return }
    fontSize = clamped
    terminalView.font = Self.font(size: clamped)
  }

  private var pinchBase: CGFloat = 14

  @objc private func pinched(_ gesture: UIPinchGestureRecognizer) {
    switch gesture.state {
    case .began: pinchBase = fontSize
    case .changed: setFontSize((pinchBase * gesture.scale).rounded())
    default: break
    }
  }

  func applyTheme(_ theme: NativeThemeRecord?) {
    guard let theme else { return }
    if let bg = theme.background.flatMap(UIColor.init(hex:)) {
      terminalView.nativeBackgroundColor = bg
      backgroundColor = bg
    }
    if let fg = theme.foreground.flatMap(UIColor.init(hex:)) {
      terminalView.nativeForegroundColor = fg
    }
    if let cursor = theme.cursorColor.flatMap(UIColor.init(hex:)) {
      terminalView.caretColor = cursor
    }
    if let sel = theme.selectionBackground.flatMap(UIColor.init(hex:)) {
      terminalView.selectedTextBackgroundColor = sel
    }
    if let palette = theme.palette, palette.count >= 16 {
      let colors = palette.prefix(16).map { hex -> SwiftTerm.Color in
        let c = hex.flatMap(UIColor.init(hex:)) ?? .white
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return SwiftTerm.Color(red: UInt16(r * 65535), green: UInt16(g * 65535), blue: UInt16(b * 65535))
      }
      terminalView.installColors(colors)
    }
  }

  func write(_ data: Data) {
    bytesParsed += Double(data.count)
    terminalView.feed(byteArray: [UInt8](data)[...])
  }

  func paste(_ text: String) {
    UIPasteboard.general.string = text
    terminalView.paste(nil)
  }

  func scrollToBottom() {
    terminalView.scrollTo(row: Int.max)
  }

  func copySelection() {
    terminalView.copy(nil)
    terminalView.selectNone()
  }

  func focusTerminal() {
    _ = terminalView.becomeFirstResponder()
  }

  func blurTerminal() {
    _ = terminalView.resignFirstResponder()
  }

  func stats() -> [String: Double] {
    var out: [String: Double] = ["bytesParsed": bytesParsed]
    let summaries = TerminalProfiling.summaries()
    // Metal frames report encode time; the Core Graphics path reports draw time.
    if let frame = summaries.first(where: { $0.event == "metalEncode" })
      ?? summaries.first(where: { $0.event == "frameDraw" })
    {
      out["renderedFrames"] = Double(frame.count)
      out["renderMsP50"] = frame.p50Ms
      out["renderMsP95"] = frame.p99Ms
      out["renderMsMax"] = frame.maxMs
    }
    return out
  }
}

extension TermixNativeView: TerminalViewDelegate {
  func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
    onResize(["cols": newCols, "rows": newRows])
  }

  func setTerminalTitle(source: TerminalView, title: String) {
    onTitleChange(["title": title])
  }

  func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}

  func send(source: TerminalView, data: ArraySlice<UInt8>) {
    onInput(["data": Data(data).base64EncodedString()])
  }

  func scrolled(source: TerminalView, position: Double) {}

  func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {}

  func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}

  func bell(source: TerminalView) {
    onBell([:])
  }
}

extension UIColor {
  /// "#rrggbb" or "rrggbb".
  convenience init?(hex: String) {
    let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
    self.init(
      red: CGFloat((v >> 16) & 0xff) / 255,
      green: CGFloat((v >> 8) & 0xff) / 255,
      blue: CGFloat(v & 0xff) / 255,
      alpha: 1)
  }
}
