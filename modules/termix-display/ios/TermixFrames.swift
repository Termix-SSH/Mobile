import CoreGraphics
import Foundation

/// Told when part of a frame changed. Called on the engine's thread.
public protocol FrameListener: AnyObject {
  func frameChanged()
}

/// A changed area in frame pixels.
public struct Dirty: Equatable {
  public var x, y, width, height: Int

  func union(_ other: Dirty) -> Dirty {
    let x1 = min(x, other.x)
    let y1 = min(y, other.y)
    return Dirty(
      x: x1, y: y1, width: max(x + width, other.x + other.width) - x1,
      height: max(y + height, other.y + other.height) - y1)
  }
}

/// A remote desktop's RGBA pixels. The engine writes rectangles, the view copies out the changed area.
/// The pixels are never shared with an image, so a write never copies the whole frame.
public final class FrameBuffer: @unchecked Sendable {
  private let lock = NSLock()
  private weak var listener: FrameListener?
  private var pixels = Data()
  private var dirty: Dirty?
  public private(set) var width = 0
  public private(set) var height = 0

  public func resize(width w: Int, height h: Int) {
    lock.lock()
    width = max(0, w)
    height = max(0, h)
    pixels = Data(count: width * height * 4)
    dirty = Dirty(x: 0, y: 0, width: width, height: height)
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
    let area = Dirty(x: x, y: y, width: x2 - x, height: y2 - y)
    dirty = dirty?.union(area) ?? area
    let notify = listener
    lock.unlock()
    notify?.frameChanged()
  }

  /// Takes the changed area and runs `draw` with the pixels locked, so they can't change mid copy.
  /// `draw` gets the area, the frame's RGBA bytes and its size.
  public func takeDirty<T>(_ draw: (Dirty, UnsafeRawBufferPointer, Int, Int) -> T) -> T? {
    lock.lock()
    defer { lock.unlock() }
    guard let area = dirty, width > 0, height > 0 else { return nil }
    dirty = nil
    return pixels.withUnsafeBytes { draw(area, $0, width, height) }
  }

  /// Marks everything as changed, for a view that just attached.
  public func markAll() {
    lock.lock()
    dirty = Dirty(x: 0, y: 0, width: width, height: height)
    lock.unlock()
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
