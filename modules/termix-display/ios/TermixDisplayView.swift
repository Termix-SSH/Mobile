import ExpoModulesCore
import QuartzCore
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// Follows a trackpad or mouse press and its buttons. Only indirect pointer touches reach it.
final class PointerPressRecognizer: UIGestureRecognizer {
  private(set) var mask: UIEvent.ButtonMask = []

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    mask = event.buttonMask
    state = .began
  }

  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
    mask = event.buttonMask
    state = .changed
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
    mask = []
    state = .ended
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
    mask = []
    state = .cancelled
  }

  override func reset() {
    mask = []
  }
}

/// Draws a frame scaled and panned. Finger touches go to JS through React's responder props;
/// hardware keys and a trackpad or mouse (hover, buttons, scroll) come here.
final class TermixDisplayView: ExpoView, FrameListener, UIGestureRecognizerDelegate {
  let onKey = EventDispatcher()
  let onPointer = EventDispatcher()

  private let desktop = CALayer()
  private var buffer: FrameBuffer?
  private var frameId: String?
  private var scale: CGFloat = 1
  private var offset = CGPoint.zero
  private var pending = false
  private var pressButtons = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    clipsToBounds = true
    desktop.anchorPoint = .zero
    desktop.magnificationFilter = .linear
    desktop.actions = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull(), "transform": NSNull()]
    layer.addSublayer(desktop)
    addPointerRecognizers()
  }

  // A trackpad or mouse hovers and scrolls without touches, and clicks with indirect pointer
  // touches. React gets those touches too; the JS gestures drop them while a press is down.
  private func addPointerRecognizers() {
    let pointer = [NSNumber(value: UITouch.TouchType.indirectPointer.rawValue)]

    let hover = UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:)))
    hover.allowedTouchTypes = pointer
    let press = PointerPressRecognizer(target: self, action: #selector(pressed(_:)))
    press.allowedTouchTypes = pointer
    let scroll = UIPanGestureRecognizer(target: self, action: #selector(scrolled(_:)))
    scroll.allowedScrollTypesMask = .all
    scroll.allowedTouchTypes = []  // Scroll only; a finger never starts it.

    for recognizer in [hover, press, scroll] {
      recognizer.cancelsTouchesInView = false
      recognizer.delegate = self
      addGestureRecognizer(recognizer)
    }
  }

  /// Bits like the JS side and Guacamole: 1 left, 2 middle, 4 right.
  private static func buttons(_ mask: UIEvent.ButtonMask) -> Int {
    var bits = 0
    if mask.contains(.primary) { bits |= 1 }
    if mask.contains(.button(3)) { bits |= 2 }
    if mask.contains(.secondary) { bits |= 4 }
    return bits
  }

  private func emit(_ kind: String, at point: CGPoint, buttons: Int = 0, dy: CGFloat = 0) {
    onPointer([
      "kind": kind,
      "x": Double(point.x),
      "y": Double(point.y),
      "buttons": buttons,
      "dy": Double(dy),
    ])
  }

  @objc private func hovered(_ gesture: UIHoverGestureRecognizer) {
    guard gesture.state == .began || gesture.state == .changed else { return }
    emit("hover", at: gesture.location(in: self))
  }

  @objc private func pressed(_ gesture: PointerPressRecognizer) {
    let at = gesture.location(in: self)
    switch gesture.state {
    case .began:
      // Some clicks come without a mask; they are the primary button.
      pressButtons = Self.buttons(gesture.mask)
      if pressButtons == 0 { pressButtons = 1 }
      emit("down", at: at, buttons: pressButtons)
    case .changed:
      let now = Self.buttons(gesture.mask)
      if now != 0 { pressButtons = now }
      emit("move", at: at, buttons: pressButtons)
    case .ended, .cancelled:
      emit("up", at: at)
    default: break
    }
  }

  @objc private func scrolled(_ gesture: UIPanGestureRecognizer) {
    guard gesture.state == .began || gesture.state == .changed else { return }
    let dy = gesture.translation(in: self).y
    gesture.setTranslation(.zero, in: self)
    if dy != 0 { emit("scroll", at: gesture.location(in: self), dy: dy) }
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    true
  }

  func setFrameId(_ id: String?) {
    guard id != frameId else { return }
    buffer?.setListener(nil)
    frameId = id
    buffer = id.map { TermixFrames.get($0) }
    buffer?.setListener(self)
    frameChanged()
  }

  func setPlacement(scale: CGFloat, offsetX: CGFloat, offsetY: CGFloat) {
    self.scale = scale
    offset = CGPoint(x: offsetX, y: offsetY)
    place()
  }

  private func place() {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    desktop.position = CGPoint(x: -offset.x * scale, y: -offset.y * scale)
    desktop.transform = CATransform3DMakeScale(scale, scale, 1)
    CATransaction.commit()
  }

  // Coalesces many rectangles into one image per main thread turn.
  func frameChanged() {
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.pending else { return }
      self.pending = true
      DispatchQueue.main.async {
        self.pending = false
        guard let image = self.buffer?.image() else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        self.desktop.bounds = CGRect(x: 0, y: 0, width: image.width, height: image.height)
        self.desktop.contents = image
        CATransaction.commit()
        self.place()
      }
    }
  }

  override var canBecomeFirstResponder: Bool { true }

  private func report(_ presses: Set<UIPress>, down: Bool) -> Bool {
    var handled = false
    for press in presses {
      guard let key = press.key else { continue }
      handled = true
      onKey([
        "key": key.charactersIgnoringModifiers,
        "char": key.characters,
        "code": key.keyCode.rawValue,
        "down": down,
      ])
    }
    return handled
  }

  override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    if !report(presses, down: true) { super.pressesBegan(presses, with: event) }
  }

  override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    if !report(presses, down: false) { super.pressesEnded(presses, with: event) }
  }

  deinit {
    buffer?.setListener(nil)
  }
}
