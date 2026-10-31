//
//  TerminalWakeupGate.swift
//  libghostty-spm
//

import Foundation

/// At most one main-queue tick outstanding per controller.
///
/// Ghostty calls `wakeup` from its IO and renderer threads once per message
/// it puts in the app mailbox — a title, a pwd, a bell — so a flood of OSC 2
/// queued one main block per title, each ticking a mailbox the first tick
/// had already drained. The flag is cleared before the tick runs, so a
/// wakeup that arrives during the tick schedules the next one: no message
/// is left waiting for a wakeup that was swallowed.
final class TerminalWakeupGate: @unchecked Sendable {
    private let lock = NSLock()
    private var isScheduled = false

    /// True when the caller must schedule the tick.
    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !isScheduled else { return false }
        isScheduled = true
        return true
    }

    func release() {
        lock.lock()
        isScheduled = false
        lock.unlock()
    }
}
