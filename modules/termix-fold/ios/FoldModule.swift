import ExpoModulesCore
import UIKit

// Where the screen bends on a foldable (iPhone Duo), in window points.
// Inactive folds are listed too, so layouts can stay put while the phone opens and closes.
public class FoldModule: Module {
  private var last: [[String: Any]] = []
  private var watcher: FoldWatchView?
  private var timer: Timer?

  public func definition() -> ModuleDefinition {
    Name("TermixFold")

    Events("onFoldChange")

    Function("getFolds") { () -> [[String: Any]] in
      self.last
    }

    OnCreate {
      DispatchQueue.main.async { self.attach() }
    }

    OnAppEntersForeground {
      self.attach()
      self.refresh()
    }

    OnDestroy {
      DispatchQueue.main.async {
        self.timer?.invalidate()
        self.timer = nil
        self.watcher?.removeFromSuperview()
        self.watcher = nil
      }
    }
  }

  private func appWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let ordered = scenes.filter { $0.activationState == .foregroundActive }
      + scenes.filter { $0.activationState != .foregroundActive }
    for scene in ordered {
      if let window = scene.windows.first(where: { $0.isKeyWindow && $0.rootViewController != nil }) {
        return window
      }
      if let window = scene.windows.first(where: { $0.rootViewController != nil }) {
        return window
      }
    }
    return nil
  }

  private func attach() {
    guard let window = appWindow() else {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.attach() }
      return
    }
    if watcher?.window === window { return }
    watcher?.removeFromSuperview()
    let view = FoldWatchView(frame: window.bounds)
    view.onLayout = { [weak self] in self?.refresh() }
    window.insertSubview(view, at: 0)
    watcher = view
    refresh()
  }

  func refresh() {
    guard let window = watcher?.window else { return }
    let folds = FoldModule.folds(in: window)
    // A fold opening may not lay anything out, so foldables also check twice a second.
    if !folds.isEmpty && timer == nil {
      timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
        self?.refresh()
      }
    }
    guard !FoldModule.same(folds, last) else { return }
    last = folds
    sendEvent("onFoldChange", ["folds": folds])
  }

  static func folds(in window: UIWindow) -> [[String: Any]] {
    #if TERMIX_DUO_SDK
    if #available(iOS 27.1, *) {
      let regions = window.reservedRegions(kind: .division, options: .includeInactive)
      return regions.map { region in
        let f = region.frame
        return [
          "x": Double(f.origin.x),
          "y": Double(f.origin.y),
          "width": Double(f.size.width),
          "height": Double(f.size.height),
          "active": region.isActive,
        ]
      }
    }
    #endif
    return []
  }

  static func same(_ a: [[String: Any]], _ b: [[String: Any]]) -> Bool {
    guard a.count == b.count else { return false }
    for (x, y) in zip(a, b) {
      for key in ["x", "y", "width", "height"] where (x[key] as? Double) != (y[key] as? Double) {
        return false
      }
      if (x["active"] as? Bool) != (y["active"] as? Bool) { return false }
    }
    return true
  }
}

/// Invisible view that follows the window and asks for a fold check on each layout.
final class FoldWatchView: UIView {
  var onLayout: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    autoresizingMask = [.flexibleWidth, .flexibleHeight]
    isUserInteractionEnabled = false
    isAccessibilityElement = false
    accessibilityElementsHidden = true
    backgroundColor = .clear
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    onLayout?()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    onLayout?()
  }
}
