import AudioToolbox
import ExpoModulesCore
import GhosttyTerminal
import TermixPipe
import UIKit

/// The ghostty view with Termix's tap, menu and key changes.
final class TermixGhosttyView: UITerminalView {
  weak var owner: TermixTerminalView?
  private var lastTouchPoint: CGPoint?

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    lastTouchPoint = touches.first?.location(in: self)
    super.touchesBegan(touches, with: event)
  }

  // A clean tap toggles the keyboard after its click. On a link it opens the link instead.
  override func toggleSoftwareKeyboard() {
    if let point = lastTouchPoint, owner?.openLinkOnTap(at: point) == true { return }
    super.toggleSoftwareKeyboard()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    takeOverLongPress()
  }

  // Trace only: shows whether typed keys reach this view.
  override func insertText(_ text: String) {
    owner?.noteKey()
    super.insertText(text)
  }

  // Long press selects the word under the finger right away, like a text view.
  // The library's press only opens a menu with a Select item.
  private var longPressTaken = false
  private func takeOverLongPress() {
    guard !longPressTaken,
      let press = gestureRecognizers?.first(where: { $0 is UILongPressGestureRecognizer })
    else { return }
    longPressTaken = true
    press.removeTarget(nil, action: nil)
    press.addTarget(self, action: #selector(selectOnLongPress(_:)))
    (press as? UILongPressGestureRecognizer)?.minimumPressDuration = 0.45
  }

  @objc private func selectOnLongPress(_ gesture: UILongPressGestureRecognizer) {
    guard gesture.state == .began else { return }
    let point = gesture.location(in: self)
    let select = NSSelectorFromString("handleSelectionTap:")
    if responds(to: select) {
      perform(select, with: SyntheticTap(point: point, taps: 2))
    }
    if hasTouchSelection { return }
    // No text under the finger: the menu with Paste and Select All.
    let menu = NSSelectorFromString("handleLongPressForSelection:")
    if responds(to: menu) {
      perform(menu, with: SyntheticPress(point: point))
    }
  }

  private var hasTouchSelection: Bool {
    subviews.contains { String(describing: type(of: $0)).hasSuffix("TouchSelectionOverlay") }
  }

  override func touchMenuItems(for context: TerminalTouchMenuContext) -> [UIMenuElement] {
    var items = super.touchMenuItems(for: context)
    if let owner, let url = owner.link(at: context.sourcePoint) {
      items.insert(UIAction(title: "Open link") { [weak owner] _ in owner?.emitLink(url) }, at: 0)
    }
    // The app's own menu for the session: find, tmux, key rows, share.
    if let owner {
      items.append(UIAction(title: "More") { [weak owner] _ in owner?.emitMenu() })
    }
    return items
  }

  override func touchSelectionMenuItems(for context: TerminalTouchSelectionMenuContext) -> [UIMenuElement] {
    var items = super.touchSelectionMenuItems(for: context)
    if let owner {
      items.append(UIAction(title: "More") { [weak owner] _ in owner?.emitMenu() })
    }
    return items
  }

  // Writing Tools would rewrite text the shell already has.
  @available(iOS 18.0, *)
  @objc var writingToolsBehavior: UIWritingToolsBehavior {
    get { .none }
    set {}
  }

  override var keyCommands: [UIKeyCommand]? {
    var commands = super.keyCommands ?? []
    // Cmd+. is Escape on iPad keyboards without an Esc key.
    commands.append(UIKeyCommand(input: ".", modifierFlags: .command, action: #selector(sendEscape)))
    // App shortcuts; the ids match src/features/terminal/shortcuts.ts.
    guard owner?.reportsShortcuts == true else { return commands }
    var app: [(String, String, UIKeyModifierFlags, String)] = [
      ("New Tab", "t", .command, "newTab"),
      ("Close Tab", "w", .command, "closeTab"),
      ("Next Tab", "]", [.command, .shift], "nextTab"),
      ("Previous Tab", "[", [.command, .shift], "prevTab"),
      ("Next Tab", "\t", .control, "nextTab"),
      ("Previous Tab", "\t", [.control, .shift], "prevTab"),
      ("Find", "f", .command, "find"),
    ]
    for n in 1...9 {
      app.append(("Tab \(n)", "\(n)", .command, "tab\(n)"))
    }
    for (title, input, flags, id) in app {
      let command = UIKeyCommand(
        title: title,
        action: #selector(appShortcut(_:)),
        input: input,
        modifierFlags: flags,
        propertyList: id
      )
      if #available(iOS 15.0, *) { command.wantsPriorityOverSystemBehavior = true }
      commands.append(command)
    }
    return commands
  }

  @objc private func sendEscape() {
    _ = sendKey(.escape)
  }

  @objc private func appShortcut(_ sender: UIKeyCommand) {
    if let id = sender.propertyList as? String { owner?.emitShortcut(id) }
  }
}

/// A finished tap at a point, handed to the library's tap handler.
private final class SyntheticTap: UITapGestureRecognizer {
  private let point: CGPoint
  init(point: CGPoint, taps: Int) {
    self.point = point
    super.init(target: nil, action: nil)
    numberOfTapsRequired = taps
  }
  override var state: UIGestureRecognizer.State {
    get { .ended }
    set {}
  }
  override func location(in _: UIView?) -> CGPoint { point }
}

/// A long press that just began, handed to the library's menu handler.
private final class SyntheticPress: UILongPressGestureRecognizer {
  private let point: CGPoint
  init(point: CGPoint) {
    self.point = point
    super.init(target: nil, action: nil)
  }
  override var state: UIGestureRecognizer.State {
    get { .began }
    set {}
  }
  override func location(in _: UIView?) -> CGPoint { point }
}

/// Feeds a session from a pipe on its own queue and stops while the parser is behind, so the
/// pipe fills and pauses its producer.
private final class PipeReader: PipeSink, @unchecked Sendable {
  private let queue = DispatchQueue(label: "termix.terminal.pipe", qos: .userInitiated)
  private let lock = NSLock()
  private var queued = false
  private var backlogged = false
  weak var session: InMemoryTerminalSession?
  var pipe: BytePipe
  var onOutput: (() -> Void)?
  private(set) var bytes: Double = 0

  init(pipe: BytePipe) {
    self.pipe = pipe
  }

  func pipeReadable() {
    schedule()
  }

  var debugState: String {
    lock.lock()
    defer { lock.unlock() }
    return "queued=\(queued) backlogged=\(backlogged) session=\(session != nil)"
  }

  func setBacklogged(_ value: Bool) {
    lock.lock()
    backlogged = value
    lock.unlock()
    if !value { schedule() }
  }

  private func schedule() {
    lock.lock()
    let start = !queued && !backlogged
    if start { queued = true }
    lock.unlock()
    if start { queue.async { self.drain() } }
  }

  private func drain() {
    while true {
      lock.lock()
      let stop = backlogged
      lock.unlock()
      if stop { break }
      guard let session, let chunk = pipe.read(max: 64 * 1024) else { break }
      bytes += Double(chunk.count)
      session.receive(chunk)
      onOutput?()
    }
    lock.lock()
    queued = false
    let again = !backlogged && pipe.queued > 0
    lock.unlock()
    if again { schedule() }
  }
}

// Ghostty terminal view. Output comes from a native pipe (local SSH) or from write; typed bytes
// and terminal replies go out through onInput. Each view has its own controller, so theme and
// font are per view.
class TermixTerminalView: ExpoView {
  private let terminalView = TermixGhosttyView(frame: .zero)
  private var session: InMemoryTerminalSession!
  private var controller: TerminalController!
  private let localPipe = BytePipe()
  private var reader: PipeReader!
  private var pipeId: String?
  private let flashView = UIView()

  private var config = ViewConfig()
  private var configScheduled = false
  private var appliedBase: String?
  private var appliedTheme: TerminalTheme?
  private var surfaceReady = false
  private var currentFontSize: Float?

  private var clipboardRequests: [Int: TerminalClipboardConfirmationRequest] = [:]
  private var nextClipboardId = 1
  private var announced: [String] = []
  private var announceWork: DispatchWorkItem?
  private var renderSoon: DispatchWorkItem?
  private var lastBell = Date.distantPast
  private var atBottom = true

  struct ViewConfig: Equatable {
    var fontFamily = "CaskaydiaCove NFM"
    var cursorStyle = "block"
    var cursorBlink = true
    var lineHeight: Double = 1
    var letterSpacing: Double = 0
    var scrollback = 10_000
    var optionAsMeta = false
    var bellStyle = "none"
    var haptics = true
    var theme: ThemeColors?
  }

  struct ThemeColors: Equatable {
    var background: String?
    var foreground: String?
    var cursorColor: String?
    var cursorAccent: String?
    var selectionBackground: String?
    var selectionForeground: String?
    var palette: [String?]
  }

  let onInput = EventDispatcher()
  let onResize = EventDispatcher()
  let onBell = EventDispatcher()
  let onTitleChange = EventDispatcher()
  let onScrollState = EventDispatcher()
  let onLink = EventDispatcher()
  let onCopy = EventDispatcher()
  let onClipboardRequest = EventDispatcher()
  let onFontSize = EventDispatcher()
  let onModifiers = EventDispatcher()
  let onPromptLine = EventDispatcher()
  let onSearch = EventDispatcher()
  let onMenu = EventDispatcher()
  let onShortcut = EventDispatcher()
  let onTrace = EventDispatcher()
  /** Set by the app when it handles shortcuts, so the keys reach the shell otherwise. */
  var reportsShortcuts = true
  private var searchTotal = 0
  private var searchSelected = -1

  /// Reports the line at the prompt once output settles, for password fill.
  var promptWatch = false {
    didSet {
      if !promptWatch {
        promptWork?.cancel()
        lastPromptLine = ""
      }
    }
  }
  private var promptWork: DispatchWorkItem?
  private var lastPromptLine = ""

  /// Hidden tabs sit off screen and keep drawing. A paused surface that got resized (the
  /// keyboard came up) kept its old frame when shown, with the prompt under the keyboard.
  /// Showing a tab draws a few fresh frames, since its move back on screen can land a
  /// moment after this prop.
  func setSurfaceVisible(_ visible: Bool) {
    let wasShown = surfaceShown
    surfaceShown = visible
    guard visible, !wasShown else { return }
    keyTraced = false
    redrawFrames(3)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      self?.emitTrace("shown")
    }
  }
  private var surfaceShown = true
  private var lastGrid = (cols: 0, rows: 0)

  private func redrawFrames(_ count: Int) {
    terminalView.fitToSize()
    guard count > 1 else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) { [weak self] in
      self?.redrawFrames(count - 1)
    }
  }

  /// Where the view and its drawn layer really are, for the trace log.
  private func emitTrace(_ name: String) {
    let rect = { (r: CGRect) in [Int(r.minX), Int(r.minY), Int(r.width), Int(r.height)] }
    let layers = (terminalView.layer.sublayers ?? [])
      .filter { !($0.delegate is UIView) }
      .map { rect($0.frame) }
    onTrace([
      "name": name,
      "bounds": rect(bounds),
      "inWindow": window.map { rect(convert(bounds, to: $0)) } ?? [],
      "ghostty": rect(terminalView.frame),
      "layers": layers,
      "cols": lastGrid.cols,
      "rows": lastGrid.rows,
      "first": terminalView.isFirstResponder,
      "shown": surfaceShown,
      "chain": ancestorChain(),
      "render": terminalView.debugRenderState,
      "output": session.debugOutputState,
      "pipeQueued": reader.pipe.queued,
      "readerBytes": Int(reader.bytes),
      "readerState": reader.debugState,
    ])
  }

  /// Every view up to the window: type, frame, scroll offset and transform shift.
  private func ancestorChain() -> [String] {
    var out: [String] = []
    var node: UIView? = terminalView
    while let view = node, out.count < 16 {
      let f = view.frame
      out.append(
        "\(type(of: view)) f=\(Int(f.minX)),\(Int(f.minY)),\(Int(f.width))x\(Int(f.height))"
          + " o=\(Int(view.bounds.minX)),\(Int(view.bounds.minY))"
          + " t=\(Int(view.transform.tx)),\(Int(view.transform.ty))"
          + (view.isHidden ? " hidden" : "") + (view.alpha < 1 ? " a=\(view.alpha)" : ""))
      node = view.superview
    }
    return out
  }

  private var keyTraced = false
  fileprivate func noteKey() {
    guard !keyTraced else { return }
    keyTraced = true
    emitTrace("key")
    // The echo should have drawn by now; the draw count says whether it did.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
      self?.emitTrace("afterKey")
    }
  }

  @objc private func keyboardShown() {
    guard surfaceShown else { return }
    keyTraced = false
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      self?.emitTrace("keyboard")
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true

    session = InMemoryTerminalSession(
      write: { [weak self] data in
        DispatchQueue.main.async { self?.onInput(["data": data.base64EncodedString()]) }
      },
      resize: { [weak self] viewport in
        DispatchQueue.main.async {
          self?.lastGrid = (Int(viewport.columns), Int(viewport.rows))
          self?.onResize(["cols": viewport.columns, "rows": viewport.rows])
        }
      }
    )
    let reader = PipeReader(pipe: localPipe)
    self.reader = reader
    reader.session = session
    reader.onOutput = { [weak self] in
      DispatchQueue.main.async { self?.outputArrived() }
    }
    session.setOutputBacklogHandler(highWater: 4 << 20, lowWater: 1 << 20) { backlogged in
      reader.setBacklogged(backlogged)
    }
    localPipe.setSink(reader)

    controller = TerminalController(configuration: baseConfiguration(), theme: TerminalTheme())
    appliedBase = baseConfiguration().rendered
    terminalView.owner = self
    terminalView.controller = controller
    terminalView.inputAccessoryItems = []
    terminalView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    terminalView.delegate = self
    terminalView.setStickyModifierChangeHandler { [weak self] in self?.reportModifiers() }
    addSubview(terminalView)

    flashView.isUserInteractionEnabled = false
    flashView.alpha = 0
    flashView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(flashView)

    isAccessibilityElement = true
    accessibilityLabel = "Terminal"
    accessibilityTraits = [.allowsDirectInteraction]

    NotificationCenter.default.addObserver(
      self, selector: #selector(keyboardShown),
      name: UIResponder.keyboardDidShowNotification, object: nil)
  }

  /// Navigators take whole screens out of the window and put them back (app tab switches,
  /// pushed screens). A ghostty view that left the window kept drawing frames that never
  /// reached the screen again. So the inner view never leaves: while this view is out of
  /// the window it waits in an off screen spot of the same window, then comes back.
  override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    guard newWindow == nil, let window, terminalView.superview === self else { return }
    // The keyboard must not follow the terminal to the other screen.
    if terminalView.isFirstResponder { _ = terminalView.resignFirstResponder() }
    let size = terminalView.bounds.size
    Self.parkingSpot(in: window).addSubview(terminalView)
    terminalView.frame = CGRect(origin: .zero, size: size)
  }

  private static weak var parking: UIView?

  private static func parkingSpot(in window: UIWindow) -> UIView {
    if let spot = parking, spot.window === window { return spot }
    let spot = UIView(frame: CGRect(x: -100_000, y: 0, width: 1, height: 1))
    spot.isUserInteractionEnabled = false
    spot.isAccessibilityElement = false
    spot.accessibilityElementsHidden = true
    window.insertSubview(spot, at: 0)
    parking = spot
    return spot
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else { return }
    if terminalView.superview !== self {
      insertSubview(terminalView, at: 0)
      terminalView.frame = bounds
    }
    guard surfaceReady else { return }
    // Never turn the surface off and on to force a frame: once it was, its new frames
    // stopped reaching the screen.
    DispatchQueue.main.async { [weak self] in
      guard let self, window != nil else { return }
      redrawFrames(3)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      self?.emitTrace("reattached")
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    terminalView.frame = bounds
    flashView.frame = bounds
    if !surfaceReady, bounds.width > 0 {
      surfaceReady = true
      // Props from the mount wait for the next main turn; the surface starts with them.
      if configScheduled { applyConfig() }
      terminalView.configuration = TerminalSurfaceOptions(backend: .inMemory(session), fontSize: currentFontSize)
    }
  }

  // MARK: - Props

  func setPipe(_ id: String?) {
    guard id != pipeId else { return }
    reader.pipe.detachSink(reader)
    if let pipeId { TermixPipes.release(pipeId) }
    pipeId = id
    reader.pipe = id.map { TermixPipes.get($0) } ?? localPipe
    reader.pipe.setSink(reader)
  }

  func setFontSize(_ size: Float?) {
    guard let size, size != currentFontSize else { return }
    currentFontSize = size
    // set_font_size keeps the grid; a new surface option would rebuild it.
    if surfaceReady { _ = terminalView.performBindingAction("set_font_size:\(size)") }
  }

  func update(_ change: (inout ViewConfig) -> Void) {
    var next = config
    change(&next)
    guard next != config else { return }
    config = next
    guard !configScheduled else { return }
    configScheduled = true
    // Props land one by one on mount; apply them once.
    DispatchQueue.main.async { [weak self] in
      // Already applied when the surface was made.
      guard let self, configScheduled else { return }
      configScheduled = false
      applyConfig()
    }
  }

  func setAccentColor(_ color: String?) {
    terminalView.tintColor = color.flatMap(UIColor.init(hex:))
  }

  private func baseConfiguration() -> TerminalConfiguration {
    var c = TerminalConfiguration.default
      .fontFamily(config.fontFamily == "monospace" ? "Menlo" : config.fontFamily)
      .cursorStyle(TerminalCursorStyle(rawValue: config.cursorStyle) ?? .block)
      .cursorStyleBlink(config.cursorBlink)
      .custom("clipboard-read", "ask")
      .custom("clipboard-write", "allow")
      .custom("clipboard-paste-protection", "true")
      .custom("macos-option-as-alt", config.optionAsMeta ? "true" : "false")
      // Ghostty counts scrollback in bytes; about a kilobyte per line.
      .custom("scrollback-limit", String(max(1, config.scrollback) * 1024))
    if config.lineHeight != 1 {
      c = c.custom("adjust-cell-height", "\(Int(((config.lineHeight - 1) * 100).rounded()))%")
    }
    if config.letterSpacing > 0 {
      c = c.custom("adjust-cell-width", "\(Int(config.letterSpacing.rounded()))")
    }
    if let size = currentFontSize { c = c.fontSize(size) }
    return c
  }

  private func themeConfiguration() -> TerminalTheme {
    guard let theme = config.theme else { return TerminalTheme() }
    var c = TerminalConfiguration()
    if let v = theme.background { c = c.background(v) }
    if let v = theme.foreground { c = c.foreground(v) }
    if let v = theme.cursorColor { c = c.cursorColor(v) }
    if let v = theme.cursorAccent { c = c.cursorText(v) }
    if let v = theme.selectionBackground { c = c.selectionBackground(v) }
    if let v = theme.selectionForeground { c = c.selectionForeground(v) }
    for (index, color) in theme.palette.enumerated() where index < 256 {
      if let color { c = c.palette(index, color: color) }
    }
    return TerminalTheme(light: c, dark: c)
  }

  private func applyConfig() {
    configScheduled = false
    let base = baseConfiguration().rendered
    if base != appliedBase {
      appliedBase = base
      _ = controller.updateConfigSource(.generated(base))
    }
    let theme = themeConfiguration()
    if theme != appliedTheme {
      appliedTheme = theme
      _ = controller.setTheme(theme)
    }
    if let background = config.theme?.background.flatMap(UIColor.init(hex:)) {
      backgroundColor = background
    }
    flashView.backgroundColor = config.theme?.foreground.flatMap(UIColor.init(hex:)) ?? .white
  }

  // MARK: - Calls from JS

  func write(_ data: Data) {
    reader.pipe.push(data)
  }

  func paste(_ text: String) {
    terminalView.paste(text: text)
  }

  func scrollToBottom() {
    _ = terminalView.performBindingAction("scroll_to_bottom")
  }

  func copySelection() {
    if terminalView.copySelectedTextToPasteboard() || terminalView.performBindingAction("copy_to_clipboard") {
      onCopy(["text": UIPasteboard.general.string ?? "", "fromProgram": false])
    }
  }

  func selectAll() {
    terminalView.selectAll(nil)
  }

  /// Ghostty's own search: plain text over the screen and scrollback.
  func search(_ query: String) {
    if query.isEmpty {
      clearSearch()
      return
    }
    _ = terminalView.performBindingAction("search:\(query)")
  }

  func searchStep(forward: Bool) {
    _ = terminalView.performBindingAction("navigate_search:\(forward ? "next" : "previous")")
  }

  func clearSearch() {
    _ = terminalView.performBindingAction("end_search")
    searchTotal = 0
    searchSelected = -1
    onSearch(["total": 0, "index": -1])
  }

  fileprivate func reportSearch() {
    onSearch(["total": searchTotal, "index": searchSelected])
  }

  /// Takes the keyboard. A tab that was just shown can refuse on the first try, so a refusal
  /// tries once more on the next main turn. Reports what it saw, for the trace log.
  func focusTerminal(done: @escaping ([String: Any]) -> Void) {
    focusWhenReady(waited: 0, done: done)
  }

  /// A tab being shown gets its focus call before its new props and position land. Focus
  /// taken while the tab is still hidden or off screen starts an input session that never
  /// gets keys, so wait a frame at a time until it is really shown.
  private func focusWhenReady(waited: Int, done: @escaping ([String: Any]) -> Void) {
    let ready = surfaceShown && isOnScreen
    if !ready, waited < 20 {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) { [weak self] in
        self?.focusWhenReady(waited: waited + 1, done: done)
      }
      return
    }
    let ok = terminalView.acquireProgrammaticFocus()
    done(["ok": ok, "waitedFrames": waited, "ready": ready, "state": focusState()])
  }

  /// In a window and inside its bounds. Hidden tabs sit far off to the side.
  private var isOnScreen: Bool {
    guard let window else { return false }
    let frame = convert(bounds, to: window)
    return frame.intersects(window.bounds)
  }

  private func focusState() -> [String: Any] {
    var touchBlocked = false
    var hidden = false
    var alpha: CGFloat = 1
    var node: UIView? = terminalView
    while let view = node {
      if !view.isUserInteractionEnabled { touchBlocked = true }
      if view.isHidden { hidden = true }
      alpha *= view.alpha
      node = view.superview
    }
    return [
      "first": terminalView.isFirstResponder,
      "window": window != nil,
      "onScreen": isOnScreen,
      "touchBlocked": touchBlocked,
      "hidden": hidden,
      "alpha": Double(alpha),
      "shown": surfaceShown,
      "surface": terminalView.surface != nil,
    ]
  }

  /// Sizes the grid to the view again and draws, after the keyboard or a tab switch moved it.
  func refit() {
    terminalView.fitToSize()
  }

  func blurTerminal() {
    _ = terminalView.resignFirstResponder()
  }

  func toggleModifier(_ name: String) {
    switch name {
    case "ctrl": terminalView.toggleStickyModifier(.ctrl)
    case "alt": terminalView.toggleStickyModifier(.alt)
    default: return
    }
    reportModifiers()
  }

  func sendKey(_ name: String, shift: Bool) {
    guard let key = Self.namedKeys[name] else { return }
    _ = terminalView.sendKey(key, modifiers: shift ? .shift : [])
  }

  func typeText(_ text: String) {
    terminalView.insertText(text)
  }

  func answerClipboard(_ id: Int, allow: Bool) {
    clipboardRequests.removeValue(forKey: id)?.respond(allow: allow)
  }

  func stats() -> [String: Double] {
    ["bytesParsed": reader.bytes]
  }

  private func reportModifiers() {
    onModifiers([
      "ctrl": terminalView.stickyActivation(for: .ctrl).rawValue,
      "alt": terminalView.stickyActivation(for: .alt).rawValue,
    ])
  }

  private static let namedKeys: [String: TerminalKey] = {
    var keys: [String: TerminalKey] = [
      "Escape": .escape, "Tab": .tab, "Enter": .enter, "Backspace": .backspace, "Delete": .delete,
      "Insert": .insert, "ArrowUp": .arrowUp, "ArrowDown": .arrowDown, "ArrowLeft": .arrowLeft,
      "ArrowRight": .arrowRight, "Home": .home, "End": .end, "PageUp": .pageUp, "PageDown": .pageDown,
    ]
    let fKeys: [TerminalKey] = [.f1, .f2, .f3, .f4, .f5, .f6, .f7, .f8, .f9, .f10, .f11, .f12]
    for (i, key) in fKeys.enumerated() { keys["F\(i + 1)"] = key }
    return keys
  }()

  // MARK: - Links

  /// The OSC 8 link under a point, or an address in the row's text.
  func link(at point: CGPoint) -> String? {
    if let surface = terminalView.surface {
      hoverLink = nil
      // Ghostty reports links while a link modifier is held; ask with Cmd, then let go.
      surface.sendMousePos(x: Double(point.x), y: Double(point.y), modifiers: .super_)
      let found = hoverLink
      surface.sendMousePos(x: Double(point.x), y: Double(point.y), modifiers: [])
      if let found { return found }
    }
    guard let cell = terminalView.viewportCell(at: point),
          let text = session.readViewportText()
    else { return nil }
    let lines = text.components(separatedBy: "\n")
    guard cell.row >= 0, cell.row < lines.count else { return nil }
    return TermixLinkFinder.find(line: lines[cell.row], column: cell.column)
  }

  fileprivate var hoverLink: String?

  /// Opens a tapped link, unless the program wants taps as mouse clicks.
  func openLinkOnTap(at point: CGPoint) -> Bool {
    if terminalView.surface?.isMouseCaptured == true { return false }
    guard let url = link(at: point) else { return false }
    emitLink(url)
    return true
  }

  func emitLink(_ url: String) {
    onLink(["url": url])
  }

  func emitMenu() {
    onMenu([:])
  }

  func emitShortcut(_ id: String) {
    onShortcut(["id": id])
  }

  // MARK: - Output

  private func outputArrived() {
    // After the screen came back to the window, output stopped drawing: the engine's
    // wakeups did not get through. Ticking here drains its mailbox and draws.
    terminalView.requestRender()
    renderSoon?.cancel()
    let render = DispatchWorkItem { [weak self] in self?.terminalView.requestRender() }
    renderSoon = render
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: render)
    if promptWatch {
      promptWork?.cancel()
      let work = DispatchWorkItem { [weak self] in self?.reportPromptLine() }
      promptWork = work
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: work)
    }
    guard UIAccessibility.isVoiceOverRunning else { return }
    announceWork?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.announceOutput() }
    announceWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
  }

  // The last line with text: the prompt sits at the bottom of what was printed.
  private func reportPromptLine() {
    guard promptWatch else { return }
    let lines = (session.readViewportText() ?? "").components(separatedBy: "\n")
    let line = lines.last { !$0.trimmingCharacters(in: .whitespaces).isEmpty } ?? ""
    let trimmed = line.replacingOccurrences(of: "\\s+$", with: "", options: .regularExpression)
    guard trimmed != lastPromptLine else { return }
    lastPromptLine = trimmed
    onPromptLine(["line": trimmed])
  }

  private func announceOutput() {
    let now = (session.readViewportText() ?? "").components(separatedBy: "\n")
    let fresh = TermixOutputAnnouncer.newLines(before: announced, now: now)
    announced = now
    if !fresh.isEmpty {
      UIAccessibility.post(notification: .announcement, argument: fresh.joined(separator: "\n"))
    }
  }

  override var accessibilityValue: String? {
    get { session.readViewportText()?.trimmingCharacters(in: .whitespacesAndNewlines) }
    set {}
  }

  private func ringBell() {
    guard Date().timeIntervalSince(lastBell) > 0.15 else { return }
    lastBell = Date()
    onBell([:])
    if config.haptics { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    if config.bellStyle == "sound" || config.bellStyle == "both" {
      AudioServicesPlaySystemSound(1103)
    }
    if config.bellStyle == "visual" || config.bellStyle == "both" {
      flashView.alpha = 0.2
      UIView.animate(withDuration: 0.12) { self.flashView.alpha = 0 }
    }
  }

  // Unanswered clipboard requests deny themselves when they go away.
  deinit {
    if let reader { reader.pipe.detachSink(reader) }
    if let pipeId { TermixPipes.release(pipeId) }
    // Free the surface and its controller now. Left to whenever the inner view goes, it was
    // torn down after the next terminal started, and that one drew nothing.
    let inner = terminalView
    MainActor.assumeIsolated {
      inner.controller = nil
      inner.removeFromSuperview()
    }
  }
}

extension TermixTerminalView:
  TerminalSurfaceBellDelegate,
  TerminalSurfaceTitleDelegate,
  TerminalSurfaceScrollbarDelegate,
  TerminalSurfaceFontSizeDelegate,
  TerminalSurfaceClipboardConfirmationDelegate,
  TerminalSurfaceHoverLinkDelegate,
  TerminalSurfaceOpenURLDelegate,
  TerminalSurfaceSearchDelegate
{
  func terminalDidStartSearch(needle _: String?) {}

  func terminalDidEndSearch() {
    searchTotal = 0
    searchSelected = -1
    reportSearch()
  }

  func terminalDidUpdateSearchTotal(_ total: Int?) {
    searchTotal = total ?? 0
    reportSearch()
  }

  func terminalDidUpdateSearchSelected(_ selected: Int?) {
    searchSelected = selected ?? -1
    reportSearch()
  }

  func terminalDidRingBell() {
    ringBell()
  }

  func terminalDidChangeTitle(_ title: String) {
    onTitleChange(["title": title])
  }

  func terminalDidUpdateScrollbar(_ scrollbar: TerminalScrollbar) {
    let bottom = scrollbar.offset + scrollbar.len >= scrollbar.total
    guard bottom != atBottom else { return }
    atBottom = bottom
    onScrollState(["atBottom": bottom])
  }

  func terminalDidChangeFontSize(_ fontSize: Float) {
    currentFontSize = fontSize
    onFontSize(["size": fontSize])
  }

  func terminalDidRequestClipboardConfirmation(_ request: TerminalClipboardConfirmationRequest) {
    let id = nextClipboardId
    nextClipboardId += 1
    clipboardRequests[id] = request
    let kind: String
    switch request.kind {
    case .paste: kind = "paste"
    case .osc52Read: kind = "read"
    case .osc52Write: kind = "write"
    }
    onClipboardRequest(["id": id, "kind": kind, "text": request.contents])
  }

  func terminalDidUpdateHoverLink(_ url: String?) {
    hoverLink = url
  }

  func terminalDidRequestOpenURL(_ url: String, kind _: TerminalOpenURLKind) {
    emitLink(url)
  }
}

private extension UIColor {
  convenience init?(hex: String) {
    var value = hex.trimmingCharacters(in: .whitespaces)
    if value.hasPrefix("#") { value.removeFirst() }
    guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return nil }
    self.init(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: 1
    )
  }
}
