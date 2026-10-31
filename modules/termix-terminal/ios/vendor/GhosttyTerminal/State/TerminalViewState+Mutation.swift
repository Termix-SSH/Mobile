//
//  TerminalViewState+Mutation.swift
//  libghostty-spm
//
//  Created by Lakr233 on 2026/3/17.
//

import Combine
import SwiftUI

public extension TerminalViewState {
    func adopt(colorScheme: ColorScheme) {
        adopt(terminalColorScheme: TerminalColorScheme(colorScheme))
    }

    func adopt(terminalColorScheme colorScheme: TerminalColorScheme) {
        guard colorScheme != controller.effectiveColorScheme else { return }
        controller.setColorScheme(colorScheme) {
            self.objectWillChange.send()
        }
        publishBackgroundColor()
    }

    @discardableResult
    func setTheme(_ theme: TerminalTheme) -> Bool {
        let changed = controller.setTheme(theme) {
            self.objectWillChange.send()
        }
        publishBackgroundColor()
        return changed
    }

    @discardableResult
    func setTerminalConfiguration(
        _ terminalConfiguration: TerminalConfiguration,
    ) -> Bool {
        let changed = controller.setTerminalConfiguration(terminalConfiguration) {
            self.objectWillChange.send()
        }
        publishBackgroundColor()
        return changed
    }
}

extension TerminalViewState {
    func publishBackgroundColor() {
        let color = programBackgroundColor ?? controller.backgroundColor
        guard backgroundColor != color else { return }
        backgroundColor = color
    }
}
