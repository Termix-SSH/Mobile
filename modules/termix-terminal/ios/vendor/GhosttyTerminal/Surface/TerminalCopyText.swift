//
//  TerminalCopyText.swift
//  libghostty-spm
//

import Foundation

/// What a copy puts on the pasteboard, whichever way the selection was made.
///
/// A TUI that lays out its own text (Claude Code, any Ink program) ends every
/// row with spaces it wrote to paint the row's background and starts the next
/// with the spaces of its gutter, and moves between rows with the cursor, so
/// the rows carry no soft-wrap mark for Ghostty to join them by. Read
/// verbatim, a copied paragraph comes out with a run of spaces before every
/// line break and an indent after it. Ghostty's own copy binding only trims
/// the trailing half (`clipboard-trim-trailing-spaces`) and the read APIs a
/// host calls trim nothing, so every copy path goes through here instead and
/// they all agree.
public enum TerminalCopyText {
    /// Trims trailing blanks from every line, and from every line after the
    /// first removes at most `startColumn` leading spaces — the column the
    /// selection began at. Text indented relative to where the selection
    /// started keeps that indentation, so a copied block of code still
    /// lines up; a gutter the first line was selected past goes away.
    public static func clean(_ text: String, startColumn: Int) -> String {
        var lines = text.components(separatedBy: "\n")
        for index in lines.indices {
            var line = Substring(lines[index])
            while let last = line.last, last == " " || last == "\t" || last == "\r" {
                line = line.dropLast()
            }
            if index > 0, startColumn > 0 {
                let indent = line.prefix { $0 == " " }.count
                line = line.dropFirst(min(indent, startColumn))
            }
            lines[index] = String(line)
        }
        return lines.joined(separator: "\n")
    }
}
