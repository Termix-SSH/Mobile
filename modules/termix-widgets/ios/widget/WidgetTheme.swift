import SwiftUI

/**
 Visual language for the widgets.

 Mirrors the app's dark session surfaces (`app/constants/designTokens.ts`):
 square corners, hairline borders, monospaced type, one accent color. The
 accent is not hardcoded — it travels in the snapshot so the widget follows the
 accent the user picked in Settings.
 */
enum Theme {
  // Static surface palette (the terminal chrome is dark in every app theme).
  static let background = Color(hex: "#0c0d0b")
  static let surface = Color(hex: "#141513")
  static let card = Color(hex: "#181917")
  static let cardRaised = Color(hex: "#1f201d")
  static let border = Color(hex: "#2a2a2a")
  static let borderStrong = Color(hex: "#3a3a3a")

  static let textPrimary = Color(hex: "#fafafa")
  static let textSecondary = Color(hex: "#a4a4a4")
  static let textTertiary = Color(hex: "#737373")

  static let online = Color(hex: "#4ade80")
  static let offline = Color(hex: "#ff6467")
  static let unknown = Color(hex: "#737373")

  static let fallbackAccent = Color(hex: "#f59145")

  static func accent(_ hex: String) -> Color {
    Color(hex: hex, fallback: fallbackAccent)
  }

  static func statusColor(_ status: HostStatus) -> Color {
    switch status {
    case .online: return online
    case .offline: return offline
    case .unknown: return unknown
    }
  }

  /// Load colouring: calm below 60%, warm to 80%, hot above.
  static func loadColor(_ percent: Int, accent: Color) -> Color {
    switch percent {
    case ..<60: return accent
    case 60..<85: return Color(hex: "#f5c542")
    default: return offline
    }
  }

  // MARK: - Typography

  static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .system(size: size, weight: weight, design: .monospaced)
  }

  static func label(_ size: CGFloat = 9) -> Font {
    .system(size: size, weight: .semibold, design: .monospaced)
  }
}

extension Color {
  /// Parses `#rrggbb` / `#rrggbbaa`, falling back when the string is unusable.
  init(hex: String, fallback: Color = Color(.sRGB, red: 0.96, green: 0.57, blue: 0.27, opacity: 1)) {
    var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if cleaned.hasPrefix("#") { cleaned.removeFirst() }

    guard cleaned.count == 6 || cleaned.count == 8,
          let value = UInt64(cleaned, radix: 16) else {
      self = fallback
      return
    }

    let hasAlpha = cleaned.count == 8
    let red = Double((value >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
    let green = Double((value >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
    let blue = Double((value >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
    let alpha = hasAlpha ? Double(value & 0xFF) / 255 : 1

    self = Color(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
  }
}

/// Applies the widget container background on iOS 17+, a plain background below.
struct WidgetBackground: ViewModifier {
  let color: Color

  func body(content: Content) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(color, for: .widget)
    } else {
      content.background(color)
    }
  }
}

extension View {
  func widgetBackground(_ color: Color = Theme.background) -> some View {
    modifier(WidgetBackground(color: color))
  }

  /// Hairline card treatment used by every tile and row.
  func termixCard(fill: Color = Theme.card, border: Color = Theme.border) -> some View {
    self
      .background(fill)
      .overlay(Rectangle().strokeBorder(border, lineWidth: 1))
  }
}

/// Compact "3m" / "2h" freshness label.
func relativeAge(from date: Date, now: Date = Date()) -> String {
  let seconds = max(0, now.timeIntervalSince(date))
  if seconds < 60 { return "now" }
  if seconds < 3600 { return "\(Int(seconds / 60))m" }
  if seconds < 86_400 { return "\(Int(seconds / 3600))h" }
  return "\(Int(seconds / 86_400))d"
}
