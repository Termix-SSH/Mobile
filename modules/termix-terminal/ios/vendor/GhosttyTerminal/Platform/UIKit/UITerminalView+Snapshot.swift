//
//  UITerminalView+Snapshot.swift
//  libghostty-spm
//

#if canImport(UIKit)
    import UIKit

    public extension UITerminalView {
        /// Renders the surface's current on-screen contents into an image.
        ///
        /// Uses `drawHierarchy(in:afterScreenUpdates:)`, which snapshots
        /// what the render server is presenting — including the Metal
        /// layer, which `CALayer.render(in:)` cannot capture. The view must
        /// be installed in a window and have a nonzero size; a surface
        /// whose rendering is paused (`setSurfaceVisible(false)`) yields
        /// its last presented frame.
        func snapshotImage() -> UIImage? {
            guard window != nil, bounds.width > 0, bounds.height > 0 else {
                return nil
            }
            let format = UIGraphicsImageRendererFormat()
            format.opaque = false
            let renderer = UIGraphicsImageRenderer(bounds: bounds, format: format)
            return renderer.image { _ in
                drawHierarchy(in: bounds, afterScreenUpdates: false)
            }
        }
    }
#endif
