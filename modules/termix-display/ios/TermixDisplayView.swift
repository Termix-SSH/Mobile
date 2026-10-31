import ExpoModulesCore
import QuartzCore
import UIKit

/// Draws a frame scaled and panned. Touch goes to the React view on top; hardware keys come here.
final class TermixDisplayView: ExpoView, FrameListener {
  let onKey = EventDispatcher()

  private let desktop = CALayer()
  private var buffer: FrameBuffer?
  private var frameId: String?
  private var scale: CGFloat = 1
  private var offset = CGPoint.zero
  private var pending = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    clipsToBounds = true
    desktop.anchorPoint = .zero
    desktop.magnificationFilter = .linear
    desktop.actions = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull(), "transform": NSNull()]
    layer.addSublayer(desktop)
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
