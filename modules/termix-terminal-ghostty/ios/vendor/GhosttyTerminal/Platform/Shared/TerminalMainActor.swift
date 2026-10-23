import Foundation

@inline(__always)
func terminalRunOnMain(
    _ operation: @escaping @MainActor () -> Void
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
