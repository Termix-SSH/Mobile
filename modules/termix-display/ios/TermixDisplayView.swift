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
  /// The desktop in tiles, row by row, for a frame of `tiled` size.
  private var tiles: [CALayer] = []
  private var tiled = (width: 0, height: 0)

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
    buffer?.markAll()
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

  // Coalesces many rectangles into one update per main thread turn.
  func frameChanged() {
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.pending else { return }
      self.pending = true
      DispatchQueue.main.async {
        self.pending = false
        self.draw()
      }
    }
  }

  // Only the tiles under the changed area get new images, so a small change copies and
  // uploads a few tiles instead of the whole desktop.
  private func draw() {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    buffer?.takeDirty { area, pixels, width, height in
      var area = area
      if width != tiled.width || height != tiled.height {
        layoutTiles(width: width, height: height)
        area = Dirty(x: 0, y: 0, width: width, height: height)
      }
      let size = Self.tileSize
      let cols = (width + size - 1) / size
      for row in (area.y / size)...((area.y + area.height - 1) / size) {
        for col in (area.x / size)...((area.x + area.width - 1) / size) {
          let tile = Dirty(
            x: col * size, y: row * size, width: min(size, width - col * size),
            height: min(size, height - row * size))
          tiles[row * cols + col].contents = Self.image(pixels, frameWidth: width, tile: tile)
        }
      }
    }
    CATransaction.commit()
  }

  private static let tileSize = 256

  private func layoutTiles(width: Int, height: Int) {
    tiles.forEach { $0.removeFromSuperlayer() }
    tiles = []
    tiled = (width, height)
    desktop.bounds = CGRect(x: 0, y: 0, width: width, height: height)
    let size = Self.tileSize
    for y in stride(from: 0, to: height, by: size) {
      for x in stride(from: 0, to: width, by: size) {
        let tile = CALayer()
        tile.anchorPoint = .zero
        tile.frame = CGRect(x: x, y: y, width: min(size, width - x), height: min(size, height - y))
        tile.isOpaque = true
        tile.magnificationFilter = .linear
        tile.actions = ["contents": NSNull()]
        desktop.addSublayer(tile)
        tiles.append(tile)
      }
    }
  }

  /// A copy of one tile's pixels, so the image never holds on to the frame.
  private static func image(_ pixels: UnsafeRawBufferPointer, frameWidth: Int, tile: Dirty) -> CGImage? {
    let rowBytes = tile.width * 4
    var data = Data(count: rowBytes * tile.height)
    data.withUnsafeMutableBytes { dst in
      for row in 0..<tile.height {
        let src = ((tile.y + row) * frameWidth + tile.x) * 4
        dst.baseAddress!.advanced(by: row * rowBytes)
          .copyMemory(from: pixels.baseAddress!.advanced(by: src), byteCount: rowBytes)
      }
    }
    guard let provider = CGDataProvider(data: data as CFData) else { return nil }
    return CGImage(
      width: tile.width, height: tile.height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: rowBytes,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
      provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
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
