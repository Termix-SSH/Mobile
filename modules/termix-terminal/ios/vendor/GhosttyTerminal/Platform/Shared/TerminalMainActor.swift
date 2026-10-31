import Foundation

@inline(__always)
func terminalRunOnMain(
    _ operation: @escaping @MainActor () -> Void,
) {
    if Thread.isMainThread {
        MainActor.assumeIsolated {
            operation()
        }
        return
    }

    DispatchQueue.main.async {
        MainActor.assumeIsolated {
            operation()
        }
    }
}

/// Runs on the main queue's *next* turn — never inline, even when the caller
/// is already on the main thread.
///
/// This exists for one narrow job: publishing a change that a view layout
/// produced. SwiftUI runs `layoutSubviews` inside its own update pass, so an
/// `@Published` mutation made from a layout-driven delegate callback lands
/// while SwiftUI is mid-update, and it says so — "Publishing changes from
/// within view updates is not allowed, this will cause undefined behavior."
/// Hopping to the next turn puts the mutation after the update pass has
/// finished, which is the only place it is legal.
///
/// Ordering is preserved: the main queue is FIFO, so two changes scheduled in
/// order are applied in that order. Use ``terminalRunOnMain`` for everything
/// else — work that merely needs *to be* on the main actor should not pay a
/// turn of latency for it.
@inline(__always)
func terminalRunOnMainNextTurn(
    _ operation: @escaping @MainActor () -> Void,
) {
    DispatchQueue.main.async {
        MainActor.assumeIsolated {
            operation()
        }
    }
}
