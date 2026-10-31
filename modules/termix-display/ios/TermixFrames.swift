import CoreGraphics
import Foundation

/// Told when part of a frame changed. Called on the engine's thread.
public protocol FrameListener: AnyObject {
  func frameChanged()
}

/// A remote desktop's RGBA pixels. The engine writes rectangles, the view turns it into an image.
public final class FrameBuffer: @unchecked Sendable {
  private let lock = NSLock()
  private weak var listener: FrameListener?
  private var pixels = Data()
  public private(set) var width = 0
  public private(set) var height = 0

  public func resize(width w: Int, height h: Int) {
    lock.lock()
    width = max(0, w)
    height = max(0, h)
    pixels = Data(count: width * height * 4)
    let notify = listener
    lock.unlock()
    notify?.frameChanged()
  }

  /// Copies `w * h` RGBA pixels to (x, y), clipped to the frame.
  public func blit(x: Int, y: Int, width w: Int, height h: Int, rgba: Data) {
    lock.lock()
    let x2 = min(width, x + w)
    let y2 = min(height, y + h)
    guard x >= 0, y >= 0, x < x2, y < y2, rgba.count >= w * h * 4 else {
      lock.unlock()
      return
    }
    let rowBytes = (x2 - x) * 4
    pixels.withUnsafeMutableBytes { dst in
      rgba.withUnsafeBytes { src in
        for row in y..<y2 {
          let s = (row - y) * w * 4
          let d = (row * width + x) * 4
          dst.baseAddress!.advanced(by: d).copyMemory(from: src.baseAddress!.advanced(by: s), byteCount: rowBytes)
        }
      }
    }
    let notify = listener
    lock.unlock()
    notify?.frameChanged()
  }

  /// A snapshot of the whole frame. The view only asks once per screen refresh.
  public func image() -> CGImage? {
    lock.lock()
    defer { lock.unlock() }
    guard width > 0, height > 0, let provider = CGDataProvider(data: pixels as CFData) else { return nil }
    return CGImage(
      width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
      provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
  }

  public func setListener(_ value: FrameListener?) {
    lock.lock()
    listener = value
    lock.unlock()
  }
}

/// Process wide frames, so the engine and the view meet by id without JS.
public enum TermixFrames {
  private static let lock = NSLock()
  private static var frames: [String: FrameBuffer] = [:]

  public static func get(_ id: String) -> FrameBuffer {
    lock.lock()
    defer { lock.unlock() }
    if let frame = frames[id] { return frame }
    let frame = FrameBuffer()
    frames[id] = frame
    return frame
  }

  public static func release(_ id: String) {
    lock.lock()
    frames.removeValue(forKey: id)
    lock.unlock()
  }
}
