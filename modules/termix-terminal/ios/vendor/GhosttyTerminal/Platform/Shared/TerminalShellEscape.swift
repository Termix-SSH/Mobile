//
//  TerminalShellEscape.swift
//  libghostty-spm
//
//  Reference:
//  - ghostty-org/ghostty
//  - macos/Sources/Ghostty/Ghostty.Shell.swift
//  Keep the character set aligned with Ghostty's `Shell.escape` so a path
//  pasted here reads the same as one dropped on the macOS app.
//

import Foundation

enum TerminalShellEscape {
    /// Characters a POSIX shell would otherwise interpret in a word.
    private static let escapedCharacters: Set<Unicode.Scalar> = [
        "\\", " ", "(", ")", "[", "]", "{", "}", "<", ">", "\"", "'", "`",
        "!", "#", "$", "&", ";", "|", "*", "?", "\t",
    ]

    /// Backslash-escapes every shell-sensitive character, the form a path
    /// takes when typed into a live prompt (as opposed to a quoted form, which
    /// would be right for building a command line to execute).
    ///
    /// Works on scalars, not graphemes: a combining mark after a space folds
    /// both into one `Character`, but the shell still reads a bare space and
    /// splits the word there.
    static func escape(_ string: String) -> String {
        var result = String.UnicodeScalarView()
        for scalar in string.unicodeScalars {
            if escapedCharacters.contains(scalar) {
                result.append("\\")
            }
            result.append(scalar)
        }
        return String(result)
    }
}
