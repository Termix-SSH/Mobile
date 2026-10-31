//
//  TerminalSurfaceView.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/16.
//

import SwiftUI

public struct TerminalSurfaceView: View {
    @Environment(\.colorScheme) private var colorScheme

    @ObservedObject var context: TerminalViewState
    let focusBinding: TerminalFocusBinding?

    public init(context: TerminalViewState) {
        self.context = context
        focusBinding = nil
    }

    init(
        context: TerminalViewState,
        focusBinding: TerminalFocusBinding?,
    ) {
        self.context = context
        self.focusBinding = focusBinding
    }

    public var body: some View {
        representable
            .background(.clear)
            .onChange(of: colorScheme) { newScheme in
                context.adopt(colorScheme: newScheme)
            }
            .onAppear {
                context.adopt(colorScheme: colorScheme)
            }
    }

    /// Every value the platform view needs is copied in here: SwiftUI runs
    /// the update pass only when the representable's own properties change,
    /// and a value read through `context` there is invisible to it.
    private var representable: TerminalViewRepresentable {
        var representable = TerminalViewRepresentable(
            context: context,
            controller: context.controller,
            configuration: context.configuration,
            isSurfaceVisible: context.isSurfaceVisible,
            focusBinding: focusBinding,
        )
        #if canImport(UIKit)
            #if !targetEnvironment(macCatalyst)
                representable.inputAccessoryItems = context.inputAccessoryItems
                    ?? TerminalInputAccessoryItem.defaultItems
            #endif
        #endif
        return representable
    }

    public func terminalFocused(
        _ condition: FocusState<Bool>.Binding,
    ) -> TerminalSurfaceView {
        TerminalSurfaceView(
            context: context,
            focusBinding: .bool(condition),
        )
    }

    public func terminalFocused<Value: Hashable>(
        _ binding: FocusState<Value?>.Binding,
        equals value: Value,
    ) -> TerminalSurfaceView {
        TerminalSurfaceView(
            context: context,
            focusBinding: .optional(binding, equals: value),
        )
    }

    public func terminalFocusOnAppear(
        _ condition: FocusState<Bool>.Binding,
    ) -> some View {
        terminalFocused(condition)
            .onAppear {
                condition.wrappedValue = true
            }
    }

    public func terminalFocusOnAppear<Value: Hashable>(
        _ binding: FocusState<Value?>.Binding,
        equals value: Value,
    ) -> some View {
        terminalFocused(binding, equals: value)
            .onAppear {
                binding.wrappedValue = value
            }
    }
}
