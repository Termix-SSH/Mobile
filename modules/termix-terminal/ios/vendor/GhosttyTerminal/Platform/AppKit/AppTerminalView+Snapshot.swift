//
//  AppTerminalView+Snapshot.swift
//  libghostty-spm
//

#if !canImport(UIKit) && canImport(AppKit)
    import AppKit

    public extension AppTerminalView {
        /// Renders the view into an image via `cacheDisplay`. Best-effort
        /// on AppKit: a Metal layer's presented frame may not be included —
        /// the UIKit twin uses a render-server snapshot
        /// (`drawHierarchy`), which does capture it.
        func snapshotImage() -> NSImage? {
            guard bounds.width > 0, bounds.height > 0,
                  let representation = bitmapImageRepForCachingDisplay(in: bounds)
            else { return nil }
            cacheDisplay(in: bounds, to: representation)
            let image = NSImage(size: bounds.size)
            image.addRepresentation(representation)
            return image
        }
    }
#endif
