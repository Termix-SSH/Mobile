import Foundation

// SwiftPM makes Bundle.module for the package resources. CocoaPods puts them in
// a resource bundle instead, so this stands in for it.
private final class GhosttyTerminalBundleToken {}

extension Bundle {
  static let module: Bundle = {
    let host = Bundle(for: GhosttyTerminalBundleToken.self)
    if let url = host.url(forResource: "GhosttyTerminalResources", withExtension: "bundle"),
      let bundle = Bundle(url: url)
    {
      return bundle
    }
    return host
  }()
}
