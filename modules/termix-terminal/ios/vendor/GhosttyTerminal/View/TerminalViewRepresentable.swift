//
//  TerminalViewRepresentable.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/16.
//

import SwiftUI
#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

@MainActor
struct TerminalViewRepresentable {
    let context: TerminalViewState
    let controller: TerminalController
    let configuration: TerminalSurfaceOptions
    /// A stored input, not read off `context` in the update pass: SwiftUI
    /// runs `updateNSView`/`updateUIView` only when the representable's own
    /// properties differ from the previous value. A flag read through the
    /// class reference is invisible to that comparison, and the update pass
    /// was skipped even for the visible surface.
    let isSurfaceVisible: Bool
    let focusBinding: TerminalFocusBinding?
    #if canImport(UIKit)
        #if !targetEnvironment(macCatalyst)
            /// Stored, like `isSurfaceVisible`, so a change to
            /// `TerminalViewState.inputAccessoryItems` alone still runs the
            /// update pass.
            var inputAccessoryItems = TerminalInputAccessoryItem.defaultItems
        #endif
    #endif

    func configureView(_ view: TerminalView, initial: Bool) {
        // SwiftUI keeps the platform view when only the `context` argument
        // changes (a tab switch without `.id`). The new state takes the
        // delegate before the controller and configuration below can
        // rebuild, so the rebuilt surface and every callback reach it, and
        // the old state lets go of the view and its surface.
        let outgoing = (view.delegate as? TerminalViewState).flatMap {
            $0 === context ? nil : $0
        }
        if initial || outgoing != nil {
            if let outgoing {
                if outgoing.attachedView === view {
                    outgoing.attachedView = nil
                }
                if outgoing.surface === view.surface {
                    outgoing.surface = nil
                }
            }
            view.delegate = context
        }

        if context.attachedView !== view {
            context.attachedView = view
        }

        if let currentController = view.controller, currentController === controller {
            // Keep the current surface.
        } else {
            view.controller = controller
        }

        // Unconditional: the coordinator's didSet gates rebuilds on
        // isEquivalent, which ignores resizeThrottleMilliseconds on purpose.
        view.configuration = configuration

        // Same controller and an equivalent configuration: nothing rebuilt,
        // so the surface the view already shows is the new state's now.
        if outgoing != nil, let surface = view.surface, context.surface !== surface {
            context.terminalDidAttachSurface(surface)
            if let fontSize = view.core.fontSize {
                context.terminalDidChangeFontSize(fontSize.points)
            }
        }

        // Forward only changes: stamping unconditionally would revert an
        // imperative `setSurfaceVisible` call on every SwiftUI update and
        // pay a per-update C call for nothing.
        if view.core.hostDeclaredDisplayVisible != isSurfaceVisible {
            view.core.hostDeclaredDisplayVisible = isSurfaceVisible
            view.setSurfaceVisible(isSurfaceVisible)
        }

        #if canImport(UIKit)
            #if !targetEnvironment(macCatalyst)
                if view.inputAccessoryItems != inputAccessoryItems {
                    view.inputAccessoryItems = inputAccessoryItems
                }
            #endif
        #endif
    }

    static func synchronizeFocus(_ view: TerminalView, with binding: TerminalFocusBinding?) {
        guard let binding else { return }

        DispatchQueue.main.async { [weak view] in
            // Acquire-only, on both platforms: `FocusState` resets itself to
            // nil whenever SwiftUI's own focus system re-evaluates (no native
            // focusable view anchors it) and may never take the true the
            // bridge writes, so treating false as "resign" drops focus right
            // after a click or the keyboard right after it opens. Moving
            // focus between surfaces doesn't need the resign either — the
            // old first responder is retired when the next one acquires.
            #if canImport(UIKit)
                guard let view, view.window != nil else { return }
                if binding.isFocused, !view.isFirstResponder {
                    view.becomeFirstResponder()
                }
            #elseif canImport(AppKit)
                guard let view, let window = view.window else { return }
                if binding.isFocused, window.firstResponder !== view {
                    window.makeFirstResponder(view)
                }
            #endif
        }
    }
}

@MainActor
struct TerminalFocusBinding {
    private let read: () -> Bool
    private let write: (Bool) -> Void

    var isFocused: Bool {
        read()
    }

    func setFocused(_ focused: Bool) {
        write(focused)
    }

    static func bool(_ binding: FocusState<Bool>.Binding) -> TerminalFocusBinding {
        TerminalFocusBinding(
            read: { binding.wrappedValue },
            write: { binding.wrappedValue = $0 },
        )
    }

    static func optional<Value: Hashable>(
        _ binding: FocusState<Value?>.Binding,
        equals value: Value,
    ) -> TerminalFocusBinding {
        TerminalFocusBinding(
            read: { binding.wrappedValue == value },
            write: { focused in
                binding.wrappedValue = focused ? value : nil
            },
        )
    }
}

@MainActor
extension TerminalFocusBinding? {
    func setFocused(_ focused: Bool) {
        guard let binding = self, binding.isFocused != focused else {
            return
        }
        binding.setFocused(focused)
    }
}
