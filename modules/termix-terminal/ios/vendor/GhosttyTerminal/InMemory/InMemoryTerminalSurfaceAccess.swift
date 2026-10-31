import Foundation
import GhosttyKit

/// Serializes host output while keeping the raw surface alive for each C call.
final class InMemoryTerminalSurfaceAccess: @unchecked Sendable {
    typealias Write = @Sendable (ghostty_surface_t, Data) -> Void
    typealias ProcessExit = @Sendable (ghostty_surface_t, UInt32, UInt64) -> Void
    typealias Tick = @Sendable (ghostty_surface_t) -> Void

    private let condition = NSCondition()
    private let outputQueue = DispatchQueue(
        label: "com.lakr233.libghostty-spm.in-memory-output",
        qos: .userInitiated,
    )
    private let write: Write
    private let processExit: ProcessExit
    private let tick: Tick

    private var surface: ghostty_surface_t?
    /// Prevents the caller from freeing a surface while a C operation uses it.
    private var activeOperations = 0
    /// Host output in arrival order, not yet handed to a surface. Each entry
    /// is consumed by whichever surface is attached when the output queue
    /// reaches it, so output queued behind a slow parse survives a surface
    /// rebuild, and output received while no surface is attached waits for
    /// the next one. The host's transport does not pause while a view
    /// (re)builds its surface — a reattach replay that lands in that gap used
    /// to be dropped, leaving the restored session showing only whatever the
    /// shell printed afterwards.
    private var operations = InMemoryTerminalPendingOperations()
    /// Bound on the bytes kept while no surface is attached: oldest bytes go
    /// first, matching what a terminal scrollback would have forgotten anyway.
    /// The next surface sees exactly this many; meanwhile up to twice as many
    /// are held, so a flood trims once per limit's worth of bytes instead of
    /// moving the whole buffer for every chunk.
    private static let pendingWriteByteLimit = 1 << 20
    /// Set when detached output went past the limit and the trim to exactly
    /// the limit is still owed to the next surface.
    private var pendingTrimOwed = false
    /// Parsing on the output queue pushes titles, pwd and command marks into
    /// ghostty's 64-slot app mailbox, which only `ghostty_app_tick` drains,
    /// and this package ticks on the main thread alone. A main-thread caller
    /// that blocks on the queue outright therefore waits forever on a write
    /// that is itself waiting for the tick, so the main thread waits in
    /// slices and ticks between them.
    private static let mainThreadPollInterval: TimeInterval = 0.01
    /// A drain block is in the output queue. One block works through the
    /// backlog instead of one block per `receive`: a flood of small writes
    /// queued a block per write, and the blocks outlived the bytes.
    private var isDrainScheduled = false
    /// Operations one drain block hands over before it yields the queue, so
    /// a `waitForPendingOutput` barrier is not starved by a live flood.
    private static let drainBatchLimit = 64
    private var backlogObserver: BacklogObserver?
    private var isBacklogged = false

    struct BacklogObserver {
        let highWater: Int
        let lowWater: Int
        let handler: @Sendable (Bool) -> Void
    }

    init(
        write: @escaping Write,
        processExit: @escaping ProcessExit,
        tick: @escaping Tick,
    ) {
        self.write = write
        self.processExit = processExit
        self.tick = tick
    }

    func setSurface(_ surface: ghostty_surface_t?) {
        condition.lock()
        let previous = self.surface
        self.surface = nil
        waitForActiveOperations(ticking: previous)
        self.surface = surface
        // Drains scheduled while detached ran without consuming anything, so
        // give every waiting operation a drain of its own.
        if surface != nil {
            if pendingTrimOwed {
                pendingTrimOwed = false
                operations.trimWrites(toLimit: Self.pendingWriteByteLimit)
            }
            scheduleDrain()
        }
        let backlogChange = takeBacklogChange()
        condition.unlock()
        backlogChange?()
    }

    @discardableResult
    func clearSurface(ifMatches expectedSurface: ghostty_surface_t?) -> Bool {
        condition.lock()
        guard surface == expectedSurface else {
            condition.unlock()
            return false
        }

        surface = nil
        waitForActiveOperations(ticking: expectedSurface)
        condition.unlock()
        return true
    }

    var currentSurface: ghostty_surface_t? {
        condition.lock()
        defer { condition.unlock() }
        return surface
    }

    func enqueueWrite(_ data: Data) {
        condition.lock()
        if surface == nil {
            operations.appendCoalescing(data)
            if operations.writeByteCount > Self.pendingWriteByteLimit {
                pendingTrimOwed = true
                if operations.writeByteCount > 2 * Self.pendingWriteByteLimit {
                    operations.trimWrites(toLimit: Self.pendingWriteByteLimit)
                }
            }
        } else {
            operations.append(.write(data))
            scheduleDrain()
        }
        let backlogChange = takeBacklogChange()
        condition.unlock()
        backlogChange?()
    }

    /// Bytes received and not yet handed to a surface.
    var pendingByteCount: Int {
        condition.lock()
        defer { condition.unlock() }
        return operations.writeByteCount
    }

    func setBacklogObserver(_ observer: BacklogObserver?) {
        condition.lock()
        backlogObserver = observer
        isBacklogged = false
        let backlogChange = takeBacklogChange()
        condition.unlock()
        backlogChange?()
    }

    func enqueueProcessExit(
        exitCode: UInt32,
        runtimeMilliseconds: UInt64,
    ) {
        condition.lock()
        defer { condition.unlock() }
        operations.append(.processExit(
            exitCode: exitCode,
            runtimeMilliseconds: runtimeMilliseconds,
        ))
        if surface != nil {
            scheduleDrain()
        }
    }

    func withCurrentSurface<Result>(
        _ operation: (ghostty_surface_t) -> Result,
    ) -> Result? {
        condition.lock()
        guard let surface else {
            condition.unlock()
            return nil
        }
        activeOperations += 1
        condition.unlock()

        defer { finishOperation() }
        return operation(surface)
    }

    /// Returns false when output is still waiting for a surface to attach:
    /// that output is parsed only once the next surface attaches.
    ///
    /// A drain block hands over at most `drainBatchLimit` operations, so one
    /// barrier can land between two batches of earlier output; the wait goes
    /// round until everything appended before it has left the queue. The
    /// operation that left last did so in a block ahead of the barrier, so
    /// its write has finished too.
    @discardableResult
    func waitForPendingOutput() -> Bool {
        condition.lock()
        let target = operations.appendedSequence
        condition.unlock()
        while true {
            waitForOutputQueueBarrier()
            condition.lock()
            let attached = surface != nil
            let done = operations.retiredSequence >= target
            let empty = operations.isEmpty
            condition.unlock()
            if !attached {
                return empty
            }
            if done {
                return true
            }
        }
    }

    private func waitForOutputQueueBarrier() {
        if Thread.isMainThread {
            let drained = DispatchSemaphore(value: 0)
            outputQueue.async { drained.signal() }
            while drained.wait(timeout: .now() + Self.mainThreadPollInterval) == .timedOut {
                tickCurrentSurface()
            }
        } else {
            outputQueue.sync {}
        }
    }

    /// Ticks outside the lock and without counting an operation: the tick can
    /// deliver a close, and a host that tears the surface down from that
    /// callback re-enters `clearSurface` on this thread. Teardown is
    /// main-actor work, so the pointer stays valid across a main-thread tick.
    private func tickCurrentSurface() {
        condition.lock()
        let current = surface
        condition.unlock()
        if let current {
            tick(current)
        }
    }

    /// Called with the lock held. Each operation goes to the surface
    /// attached when the drain reaches it; a drain that finds no surface
    /// stops, and `setSurface` schedules the next one.
    private func scheduleDrain() {
        guard !isDrainScheduled else { return }
        isDrainScheduled = true
        outputQueue.async { [self] in drain() }
    }

    private func drain() {
        for _ in 0 ..< Self.drainBatchLimit {
            guard drainOne() else { return }
        }
        condition.lock()
        isDrainScheduled = false
        if surface != nil, !operations.isEmpty {
            scheduleDrain()
        }
        condition.unlock()
    }

    /// False once nothing is left to hand over, with the drain unscheduled.
    private func drainOne() -> Bool {
        condition.lock()
        guard let surface, let operation = operations.popFirst() else {
            isDrainScheduled = false
            condition.unlock()
            return false
        }
        activeOperations += 1
        condition.unlock()

        defer { finishOperation() }
        switch operation {
        case let .write(data):
            write(surface, data)
        case let .processExit(exitCode, runtimeMilliseconds):
            processExit(surface, exitCode, runtimeMilliseconds)
        }
        return true
    }

    /// Called with the lock held; the caller runs the result after unlocking,
    /// so a handler may call back into the session.
    private func takeBacklogChange() -> (() -> Void)? {
        guard let backlogObserver else { return nil }
        let bytes = operations.writeByteCount
        let backlogged: Bool = if isBacklogged {
            bytes > backlogObserver.lowWater
        } else {
            bytes >= backlogObserver.highWater
        }
        guard backlogged != isBacklogged else { return nil }
        isBacklogged = backlogged
        let handler = backlogObserver.handler
        return { handler(backlogged) }
    }

    private func finishOperation() {
        condition.lock()
        activeOperations -= 1
        if activeOperations == 0 {
            condition.broadcast()
        }
        let backlogChange = takeBacklogChange()
        condition.unlock()
        backlogChange?()
    }

    /// Called with the lock held. `previous` is the surface the in-flight
    /// operations use; the caller frees it only after this returns.
    private func waitForActiveOperations(ticking previous: ghostty_surface_t?) {
        while activeOperations > 0 {
            guard Thread.isMainThread, let previous else {
                condition.wait()
                continue
            }
            _ = condition.wait(until: Date(timeIntervalSinceNow: Self.mainThreadPollInterval))
            guard activeOperations > 0 else { return }
            condition.unlock()
            tick(previous)
            condition.lock()
        }
    }
}
