//
//  PlatformSupport.swift
//  libghostty-spm
//

// The library's one platform assertion.
//
// Every other file guards its code with `#if canImport(UIKit)` /
// `#elseif canImport(AppKit)` and stops there — none of them carries an
// `#else` arm of its own. A target with neither framework would quietly
// compile all of them to nothing, so the failure is stated once, here, in a
// file that is always compiled and has no other content to distract from it.
//
// See AGENTS.md, "Platform Guards", for the order the rest of the library
// follows.
#if !canImport(UIKit) && !canImport(AppKit)
    #error("Unsupported platform: libghostty-spm requires UIKit or AppKit.")
#endif
