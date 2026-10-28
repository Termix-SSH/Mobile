import ExpoModulesCore
import UIKit

// Under the scene life cycle the root view could keep its portrait size after a turn,
// so landscape showed the app cut off on the left half. This keeps the window's root
// view filling the window and tells React Native the size changed.
public class WindowFitAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let center = NotificationCenter.default
    center.addObserver(
      forName: UIScene.didActivateNotification, object: nil, queue: .main
    ) { _ in WindowFit.attachAll() }
    center.addObserver(
      forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
    ) { _ in WindowFit.attachAll() }
    return true
  }
}

enum WindowFit {
  static func attachAll() {
    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else { continue }
      for window in windowScene.windows where window.rootViewController != nil {
        if window.subviews.contains(where: { $0 is WindowFitView }) { continue }
        let watcher = WindowFitView(frame: window.bounds)
        window.insertSubview(watcher, at: 0)
      }
    }
  }
}

/// Invisible view that follows the window size and fixes the root view after it.
final class WindowFitView: UIView {
  private var lastSize: CGSize = .zero

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
    guard let window else { return }
    if frame != window.bounds { frame = window.bounds }
    let size = window.bounds.size
    guard size != lastSize, size.width > 0, size.height > 0 else { return }
    lastSize = size
    fit(window)
  }

  private func fit(_ window: UIWindow) {
    guard let root = window.rootViewController?.view else { return }
    if root.frame != window.bounds { root.frame = window.bounds }
    // The dev client puts the app's root view inside a wrapper, so fill one level down too.
    for child in root.subviews
    where child.autoresizingMask.contains([.flexibleWidth, .flexibleHeight])
      && child.frame != root.bounds {
      child.frame = root.bounds
    }
    root.setNeedsLayout()
    root.layoutIfNeeded()
    // React Native's Dimensions listens for this. Same payload its own root view sends.
    NotificationCenter.default.post(
      name: Notification.Name("RCTUserInterfaceStyleDidChangeNotification"),
      object: self,
      userInfo: ["traitCollection": window.traitCollection]
    )
  }
}
