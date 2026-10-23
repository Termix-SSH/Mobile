import ExpoModulesCore
import GhosttyTerminal
import UIKit

// Ghostty terminal view. JS owns the transport; this view renders bytes pushed
// through write and reports input and grid size back.
class TermixGhosttyView: ExpoView {
  private let terminalView = TerminalView(frame: .zero)
  private var session: InMemoryTerminalSession?
  private var bytesParsed: Double = 0

  // The app embeds CaskaydiaCove through the expo-font config plugin.
  static let fontFamily = "CaskaydiaCove NFM"

  /// Changing it after mount rebuilds the surface, which resets the grid.
  var fontSize: Float? {
    didSet {
      guard fontSize != oldValue, let session else { return }
      terminalView.configuration = TerminalSurfaceOptions(
        backend: .inMemory(session),
        fontSize: fontSize
      )
    }
  }

  /// Theme and font go through the shared controller, so they are app wide.
  func applyTheme(_ theme: TerminalThemeRecord?) {
    var config = TerminalConfiguration().fontFamily(Self.fontFamily)
    if let theme {
      if let value = theme.background { config = config.background(value) }
      if let value = theme.foreground { config = config.foreground(value) }
      if let value = theme.cursorColor { config = config.cursorColor(value) }
      if let value = theme.selectionBackground { config = config.selectionBackground(value) }
      if let value = theme.selectionForeground { config = config.selectionForeground(value) }
      if let palette = theme.palette {
        for (index, color) in palette.enumerated() where index < 256 {
          if let color { config = config.palette(index, color: color) }
        }
      }
    }
    _ = TerminalController.shared.setTheme(TerminalTheme(light: config, dark: config))
  }

  let onInput = EventDispatcher()
  let onResize = EventDispatcher()
  let onBell = EventDispatcher()
  let onTitleChange = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true

    let session = InMemoryTerminalSession(
      write: { [weak self] data in
        self?.onInput(["data": data.base64EncodedString()])
      },
      resize: { [weak self] viewport in
        self?.onResize(["cols": viewport.columns, "rows": viewport.rows])
      }
    )
    self.session = session
    terminalView.controller = TerminalController.shared
    terminalView.configuration = TerminalSurfaceOptions(backend: .inMemory(session))
    terminalView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    terminalView.isAccessibilityElement = true
    terminalView.accessibilityLabel = "Terminal"
    terminalView.accessibilityTraits = [.allowsDirectInteraction]
    terminalView.delegate = self
    addSubview(terminalView)
  }

  func write(_ data: Data) {
    bytesParsed += Double(data.count)
    session?.receive(data)
  }

  func paste(_ text: String) {
    UIPasteboard.general.string = text
    _ = terminalView.performBindingAction("paste_from_clipboard")
  }

  func scrollToBottom() {
    _ = terminalView.performBindingAction("scroll_to_bottom")
  }

  func copySelection() {
    _ = terminalView.performBindingAction("copy_to_clipboard")
  }

  func focusTerminal() {
    _ = terminalView.becomeFirstResponder()
  }

  func blurTerminal() {
    _ = terminalView.resignFirstResponder()
  }

  /// The Metal renderer runs on its own thread and reports no frame times.
  func stats() -> [String: Double] {
    ["bytesParsed": bytesParsed]
  }
}

extension TermixGhosttyView: TerminalSurfaceBellDelegate, TerminalSurfaceTitleDelegate {
  func terminalDidRingBell() {
    onBell([:])
  }

  func terminalDidChangeTitle(_ title: String) {
    onTitleChange(["title": title])
  }
}
