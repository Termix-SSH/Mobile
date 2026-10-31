import Foundation

/// The document a text input client presents to the system: `anchorLength`
/// positions that hold no text, then the marked text. Positions handed to
/// the system are document positions; the marked-text state works in
/// marked-text offsets, and this is the one place that converts between them.
struct TerminalInputDocument {
    let anchorLength: Int
    let markedLength: Int

    var length: Int {
        anchorLength + markedLength
    }

    /// The document position of an offset into the marked text.
    func position(ofMarkedOffset offset: Int) -> Int {
        anchorLength + min(max(offset, 0), markedLength)
    }

    /// The marked-text offset nearest a document position: anything over
    /// the anchor is the start of the marked text.
    func markedOffset(of position: Int) -> Int {
        min(max(position - anchorLength, 0), markedLength)
    }

    /// The part of a document range that lies in the marked text, in
    /// marked-text offsets. The anchor contributes nothing.
    func markedRange(of range: NSRange) -> NSRange {
        let start = markedOffset(of: range.location)
        let end = max(markedOffset(of: range.location + range.length), start)
        return NSRange(location: start, length: end - start)
    }
}
