import Foundation

/// Finds a web address under a tapped column. Same rules as LinkFinder.kt on Android.
enum TermixLinkFinder {
  private static let pattern = try? NSRegularExpression(
    pattern: #"(?:https?|ftp)://[^\s<>"'`{}|\\^]+|www\.[^\s<>"'`{}|\\^]+"#,
    options: [.caseInsensitive]
  )

  // Punctuation that usually ends a sentence, not the address.
  private static let trailing = Set(".,;:!?'\")]}>")

  static func find(line: String, column: Int) -> String? {
    guard let pattern else { return nil }
    let chars = Array(line)
    // Column where each character starts; wide characters take two.
    var columns: [Int] = []
    var col = 0
    for ch in chars {
      columns.append(col)
      col += isWide(ch) ? 2 : 1
    }
    let ns = line as NSString
    for match in pattern.matches(in: line, range: NSRange(location: 0, length: ns.length)) {
      guard let range = Range(match.range, in: line) else { continue }
      let start = line.distance(from: line.startIndex, to: range.lowerBound)
      var end = line.distance(from: line.startIndex, to: range.upperBound) - 1
      while end > start, trailing.contains(chars[end]), !keepsBracket(chars, start, end) { end -= 1 }
      let first = columns[start]
      let last = columns[end] + (isWide(chars[end]) ? 1 : 0)
      if column >= first && column <= last {
        let url = String(chars[start ... end])
        return url.lowercased().hasPrefix("www.") ? "https://\(url)" : url
      }
    }
    return nil
  }

  private static func keepsBracket(_ chars: [Character], _ start: Int, _ end: Int) -> Bool {
    let open: Character
    switch chars[end] {
    case ")": open = "("
    case "]": open = "["
    case "}": open = "{"
    default: return false
    }
    let slice = chars[start ... end]
    return slice.filter { $0 == open }.count >= slice.filter { $0 == chars[end] }.count
  }

  private static func isWide(_ ch: Character) -> Bool {
    guard let scalar = ch.unicodeScalars.first else { return false }
    let v = scalar.value
    return (0x1100 ... 0x115F).contains(v) || (0x2E80 ... 0xA4CF).contains(v) ||
      (0xAC00 ... 0xD7A3).contains(v) || (0xF900 ... 0xFAFF).contains(v) ||
      (0xFE30 ... 0xFE4F).contains(v) || (0xFF00 ... 0xFF60).contains(v) ||
      (0xFFE0 ... 0xFFE6).contains(v) || (0x1F300 ... 0x1FAFF).contains(v) ||
      (0x20000 ... 0x3FFFD).contains(v)
  }
}

/// Picks the new lines a screen reader should read. Same rules as OutputAnnouncer.kt.
enum TermixOutputAnnouncer {
  static let maxLines = 5

  static func newLines(before: [String], now: [String]) -> [String] {
    let current = now.map(trimEnd).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    if current.isEmpty { return [] }
    let previous = before.map(trimEnd).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    if previous == current { return [] }
    if let old = previous.last, current.count == previous.count,
       Array(current.dropLast()) == Array(previous.dropLast()), let line = current.last
    {
      let added = (line.hasPrefix(old) ? String(line.dropFirst(old.count)) : line)
        .trimmingCharacters(in: .whitespaces)
      return added.count <= 1 ? [] : [added]
    }
    var take = min(previous.count, 3)
    while take >= 1 {
      let tail = Array(previous.suffix(take))
      if let at = lastIndex(of: tail, in: current) {
        return Array(current[(at + take)...].suffix(maxLines))
      }
      take -= 1
    }
    return Array(current.suffix(maxLines))
  }

  private static func trimEnd(_ s: String) -> String {
    var s = s
    while let last = s.last, last.isWhitespace { s.removeLast() }
    return s
  }

  private static func lastIndex(of run: [String], in lines: [String]) -> Int? {
    guard lines.count >= run.count else { return nil }
    for start in stride(from: lines.count - run.count, through: 0, by: -1) {
      if Array(lines[start ..< start + run.count]) == run { return start }
    }
    return nil
  }
}
