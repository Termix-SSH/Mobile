//
//  TerminalController+Callbacks.swift
//  libghostty-spm
//

import Foundation
import GhosttyKit

#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

private enum TerminalCallbacks {
    static func wakeup(userdata: UnsafeMutableRawPointer?) {
        guard let userdata else { return }
        let controller = Unmanaged<TerminalController>.fromOpaque(userdata)
            .takeUnretainedValue()
        // A wakeup on the main thread comes from inside a tick or a C call
        // the main thread made; it ticks inline, as it always has.
        if Thread.isMainThread {
            MainActor.assumeIsolated { controller.handleWakeup() }
            return
        }
        guard controller.wakeupGate.claim() else { return }
        DispatchQueue.main.async {
            controller.wakeupGate.release()
            MainActor.assumeIsolated { controller.handleWakeup() }
        }
    }

    static func action(
        appPtr: ghostty_app_t?,
        target: ghostty_target_s,
        action: ghostty_action_s,
    ) -> Bool {
        guard let appPtr else { return false }
        guard ghostty_app_userdata(appPtr) != nil else { return false }
        guard target.tag == GHOSTTY_TARGET_SURFACE else { return false }
        guard let surfacePtr = target.target.surface else { return false }
        guard let bridgePtr = ghostty_surface_userdata(surfacePtr) else { return false }

        let bridge = Unmanaged<TerminalCallbackBridge>
            .fromOpaque(bridgePtr)
            .takeUnretainedValue()
        guard Thread.isMainThread else {
            terminalRunOnMain { bridge.handleAction(action) }
            return false
        }
        return MainActor.assumeIsolated {
            bridge.handleAction(action)
            // Core spawns /usr/bin/open for an open_url reported unhandled,
            // so a host delegate that took the URL is reported as handling
            // it. Both open_url emitters run on the main thread.
            return action.tag == GHOSTTY_ACTION_OPEN_URL
                && bridge.delegate is any TerminalSurfaceOpenURLDelegate
        }
    }

    static func closeSurface(
        userdata: UnsafeMutableRawPointer?,
        processAlive: Bool,
    ) {
        guard let userdata else { return }
        let bridge = Unmanaged<TerminalCallbackBridge>
            .fromOpaque(userdata)
            .takeUnretainedValue()
        terminalRunOnMain {
            bridge.handleClose(processAlive: processAlive)
        }
    }

    /// A program wrote the clipboard (OSC 52), or a copy binding did.
    ///
    /// `confirm` is ghostty's `clipboard-write = ask`: the write must not
    /// land until the host has asked. That goes through the same
    /// confirmation delegate as a protected read; a host without one denies
    /// it, as it does the read. The default configuration allows writes
    /// outright, and those land immediately.
    ///
    /// Writes one or more MIME-typed representations to the system
    /// pasteboard. `ghostty_clipboard_content_s` is binary-safe with an
    /// explicit `len` and is **not** guaranteed NUL-terminated, so every
    /// representation must be decoded length-bounded rather than via
    /// `String(cString:)` — a NUL-terminated read here would compile clean
    /// and read past the end of the buffer.
    static func writeClipboard(
        userdata: UnsafeMutableRawPointer?,
        clipboard: ghostty_clipboard_e,
        contents: UnsafePointer<ghostty_clipboard_content_s>?,
        contentsLen: Int,
        confirm: Bool,
    ) {
        // The selection clipboard is advertised (`supports_selection_clipboard`)
        // so that `copy-on-select` writes there and not to the one pasteboard
        // the user has — otherwise every drag, and every double-click a tap
        // lands within ghostty's click interval, would replace it. Nothing
        // exposes a primary selection, so those writes go nowhere.
        guard clipboard == GHOSTTY_CLIPBOARD_STANDARD else { return }

        let payloads = copyClipboardContents(contents, count: contentsLen)
        guard !payloads.isEmpty else { return }

        TerminalDebugLog.log(
            .input,
            "clipboard write count=\(payloads.count) mimes=\(payloads.map(\.mime).joined(separator: ",")) confirm=\(confirm)",
        )

        guard confirm else {
            terminalRunOnMain { setPasteboardString(payloads) }
            return
        }
        guard let userdata else { return }
        let bridge = Unmanaged<TerminalCallbackBridge>
            .fromOpaque(userdata)
            .takeUnretainedValue()
        let text = firstTextRepresentation(in: payloads) ?? ""
        terminalRunOnMain {
            bridge.handleClipboardConfirmation(contents: text, kind: .osc52Write) { allowed in
                TerminalDebugLog.log(
                    .input,
                    allowed ? "clipboard write allowed" : "clipboard write denied",
                )
                guard allowed else { return }
                setPasteboardString(payloads)
            }
        }
    }

    @MainActor
    private static func setPasteboardString(_ payloads: [TerminalClipboardContent]) {
        #if canImport(UIKit)
            if let text = payloads.first(where: { isTextLikeMime($0.mime) }) {
                UIPasteboard.general.string = String(decoding: text.data, as: UTF8.self)
            }
        #elseif canImport(AppKit)
            let pasteboard = NSPasteboard.general
            pasteboard.clearContents()
            for payload in payloads {
                if isTextLikeMime(payload.mime) {
                    pasteboard.setString(String(decoding: payload.data, as: UTF8.self), forType: .string)
                } else {
                    pasteboard.setData(payload.data, forType: NSPasteboard.PasteboardType(payload.mime))
                }
            }
        #endif
    }

    /// Reads the system pasteboard on behalf of a clipboard-read request
    /// (a keybound paste, an OSC 52 read, or a Kitty clipboard read). This
    /// callback only reports facts about the pasteboard — whether the read
    /// started, found nothing to serve, or can't be served at all.
    /// libghostty decides on its own, from the request's *type* (which this
    /// callback is never told), whether the result additionally needs the
    /// host's permission; when it does, it calls back through
    /// `confirmReadClipboard` before anything reaches the requesting
    /// program.
    static func readClipboard(
        userdata: UnsafeMutableRawPointer?,
        clipboard _: ghostty_clipboard_e,
        statePtr: UnsafeMutableRawPointer?,
        mimes: UnsafePointer<UnsafePointer<CChar>?>?,
        mimesLen: Int,
        listAvailable: Bool,
    ) -> ghostty_clipboard_read_result_e {
        guard let userdata, let statePtr else { return GHOSTTY_CLIPBOARD_READ_UNSUPPORTED }

        let bridge = Unmanaged<TerminalCallbackBridge>
            .fromOpaque(userdata)
            .takeUnretainedValue()
        guard bridge.rawSurface != nil else { return GHOSTTY_CLIPBOARD_READ_UNSUPPORTED }

        let requestedMimes = copyMimeList(mimes, count: mimesLen)
        // A mode 5522 "list" request must not read any clipboard data — it
        // only wants the type listing.
        let wantsListOnly = mimesLen == 0 && listAvailable
        // Everything we can serve is plain text; a caller asking only for
        // something else has no representation we can fulfill.
        let wantsUnsupportedMime = !wantsListOnly
            && !requestedMimes.isEmpty
            && !requestedMimes.contains(where: isTextLikeMime)
        if wantsUnsupportedMime {
            TerminalDebugLog.log(.input, "clipboard paste read unsupported mimes=\(requestedMimes)")
            return GHOSTTY_CLIPBOARD_READ_UNSUPPORTED
        }

        guard !wantsListOnly else {
            let available = TerminalPasteboardContent.hasText() ? ["text/plain"] : []
            TerminalDebugLog.log(.input, "clipboard paste list available=\(available)")
            bridge.completeClipboardRead(statePtr: statePtr, contents: [], available: available)
            return GHOSTTY_CLIPBOARD_READ_STARTED
        }

        // Text and file URLs only, through the shared reader: a file copied
        // in Finder or Files pastes as its escaped path, not its display
        // name. This also serves a program's OSC 52 read, which must not
        // write files as a side effect; a host paste that finds image or
        // document data materialises it itself
        // (`UITerminalView.pasteFromPasteboard`).
        let string = TerminalPasteboardContent.text()

        let hasText = string.map { !$0.isEmpty } ?? false
        let available = listAvailable && hasText ? ["text/plain"] : []

        guard let string, hasText else {
            TerminalDebugLog.log(.input, "clipboard paste read empty")
            return GHOSTTY_CLIPBOARD_READ_UNAVAILABLE
        }

        TerminalDebugLog.log(
            .input,
            "clipboard paste read bytes=\(string.utf8.count) lines=\(TerminalInputText.lineCount(in: string))",
        )
        let content = TerminalClipboardContent(mime: "text/plain", data: Data(string.utf8))
        bridge.completeClipboardRead(statePtr: statePtr, contents: [content], available: available)
        TerminalDebugLog.log(.input, "clipboard paste complete")
        return GHOSTTY_CLIPBOARD_READ_STARTED
    }

    /// libghostty determined the pending read needs the host's explicit
    /// permission (OSC 52 / Kitty clipboard protocol) before it can reach
    /// the requesting program. `confirm`'s contents are only borrowed for
    /// this call — copy everything out before any hop or async work, per
    /// the header's doc comment on `ghostty_runtime_confirm_read_clipboard_cb`.
    static func confirmReadClipboard(
        userdata: UnsafeMutableRawPointer?,
        confirm: UnsafePointer<ghostty_clipboard_confirm_s>?,
        statePtr: UnsafeMutableRawPointer?,
        request: ghostty_clipboard_request_e,
    ) {
        guard let userdata, let confirm, let statePtr else { return }

        let bridge = Unmanaged<TerminalCallbackBridge>
            .fromOpaque(userdata)
            .takeUnretainedValue()

        let raw = confirm.pointee
        let contents = copyClipboardContents(raw.contents, count: raw.contents_len)
        let available = copyMimeList(raw.available, count: raw.available_len)
        let text = firstTextRepresentation(in: contents) ?? ""

        // The new clipboard-request enum grew Kitty-clipboard-protocol and
        // "list" cases that upstream's `TerminalClipboardRequestKind` (and
        // its confirmation delegate) don't model yet. Deny outright rather
        // than silently dropping the request unanswered: an unanswered
        // request hangs the requesting program indefinitely.
        guard let kind = TerminalClipboardRequestKind(request) else {
            TerminalDebugLog.log(
                .input,
                "clipboard confirm denied: unrecognized request kind=\(request.rawValue)",
            )
            // Round-tripped through a bit pattern, not captured directly:
            // a raw pointer captured as-is by this main-actor-crossing
            // closure trips Swift 6's sending-risks-data-race check.
            let stateAddress = UInt(bitPattern: statePtr)
            terminalRunOnMain {
                guard let surface = bridge.rawSurface,
                      let statePtr = UnsafeMutableRawPointer(bitPattern: stateAddress)
                else { return }
                ghostty_surface_deny_clipboard_request(surface, statePtr)
            }
            return
        }

        TerminalDebugLog.log(
            .input,
            "clipboard paste confirm request=\(request.rawValue) bytes=\(text.utf8.count) lines=\(TerminalInputText.lineCount(in: text))",
        )

        // Registered synchronously, before the hop to main: a surface
        // teardown racing this callback must be able to find and deny this
        // request the moment it's observable, not only after the hop lands.
        let token = bridge.registerPendingClipboardRequest(statePtr)

        terminalRunOnMain {
            bridge.handleClipboardConfirmation(contents: text, kind: kind) { allowed in
                token.resolve(allowed, contents: contents, available: available)
            }
        }
    }
}

// MARK: - C interop helpers

private func isTextLikeMime(_ mime: String) -> Bool {
    mime == "text/plain" || mime.hasPrefix("text/plain;")
}

private func firstTextRepresentation(in contents: [TerminalClipboardContent]) -> String? {
    guard let chosen = contents.first(where: { isTextLikeMime($0.mime) }) ?? contents.first else {
        return nil
    }
    return String(decoding: chosen.data, as: UTF8.self)
}

private func copyClipboardContents(
    _ ptr: UnsafePointer<ghostty_clipboard_content_s>?,
    count: Int,
) -> [TerminalClipboardContent] {
    guard let ptr, count > 0 else { return [] }
    let buffer = UnsafeBufferPointer(start: ptr, count: count)
    return buffer.compactMap { item in
        guard let mimePtr = item.mime else { return nil }
        let mime = String(cString: mimePtr)
        guard let dataPtr = item.data, item.len > 0 else {
            return TerminalClipboardContent(mime: mime, data: Data())
        }
        let data = Data(bytes: UnsafeRawPointer(dataPtr), count: item.len)
        return TerminalClipboardContent(mime: mime, data: data)
    }
}

private func copyMimeList(
    _ ptr: UnsafePointer<UnsafePointer<CChar>?>?,
    count: Int,
) -> [String] {
    guard let ptr, count > 0 else { return [] }
    let buffer = UnsafeBufferPointer(start: ptr, count: count)
    return buffer.compactMap { $0.map { String(cString: $0) } }
}

/// Builds a `ghostty_clipboard_complete_s` over freshly allocated,
/// caller-owned buffers and frees them after `body` returns. libghostty
/// only borrows the payload for the duration of the call (mirroring the
/// contract on `confirmReadClipboard`'s incoming payload), so nothing here
/// needs to outlive it.
func withClipboardCompletePayload<R>(
    contents: [TerminalClipboardContent],
    available: [String],
    confirmed: Bool,
    remember: Bool,
    _ body: (UnsafePointer<ghostty_clipboard_complete_s>) -> R,
) -> R {
    var mimeCStrings: [UnsafeMutablePointer<CChar>?] = []
    var dataBuffers: [UnsafeMutableRawPointer] = []
    var availableCStrings: [UnsafeMutablePointer<CChar>?] = []
    defer {
        for mimeCString in mimeCStrings {
            if let p = mimeCString {
                free(p)
            }
        }
        dataBuffers.forEach { free($0) }
        for availableCString in availableCStrings {
            if let p = availableCString {
                free(p)
            }
        }
    }

    let cContents: [ghostty_clipboard_content_s] = contents.map { content in
        let mimePtr = strdup(content.mime)
        mimeCStrings.append(mimePtr)
        let byteCount = content.data.count
        let dataPtr = UnsafeMutableRawPointer.allocate(
            byteCount: max(byteCount, 1),
            alignment: MemoryLayout<UInt8>.alignment,
        )
        if byteCount > 0 {
            content.data.withUnsafeBytes { raw in
                if let base = raw.baseAddress {
                    dataPtr.copyMemory(from: base, byteCount: byteCount)
                }
            }
        }
        dataBuffers.append(dataPtr)
        return ghostty_clipboard_content_s(
            mime: mimePtr.map { UnsafePointer($0) },
            data: dataPtr.assumingMemoryBound(to: CChar.self),
            len: byteCount,
        )
    }

    availableCStrings = available.map { strdup($0) }
    let availablePtrs: [UnsafePointer<CChar>?] = availableCStrings.map { $0.map { UnsafePointer($0) } }

    return cContents.withUnsafeBufferPointer { contentsBuf in
        availablePtrs.withUnsafeBufferPointer { availableBuf in
            var complete = ghostty_clipboard_complete_s(
                contents: contentsBuf.baseAddress,
                contents_len: contentsBuf.count,
                available: availableBuf.baseAddress,
                available_len: availableBuf.count,
                confirmed: confirmed,
                remember: remember,
            )
            return withUnsafePointer(to: &complete) { body($0) }
        }
    }
}

private extension TerminalCallbackBridge {
    /// Completes a clipboard read from `readClipboard` itself — always
    /// `confirmed: false`, since this callback is never told whether the
    /// request's type requires confirmation. libghostty diverts into
    /// `confirmReadClipboard` on its own when it does.
    nonisolated func completeClipboardRead(
        statePtr: UnsafeMutableRawPointer,
        contents: [TerminalClipboardContent],
        available: [String],
    ) {
        guard let surface = rawSurface else { return }
        withClipboardCompletePayload(
            contents: contents,
            available: available,
            confirmed: false,
            remember: false,
        ) { complete in
            ghostty_surface_complete_clipboard_request(surface, complete, statePtr)
        }
    }
}

func terminalControllerWakeupCallback(userdata: UnsafeMutableRawPointer?) {
    TerminalCallbacks.wakeup(userdata: userdata)
}

func terminalControllerActionCallback(
    appPtr: ghostty_app_t?,
    target: ghostty_target_s,
    action: ghostty_action_s,
) -> Bool {
    TerminalCallbacks.action(appPtr: appPtr, target: target, action: action)
}

func terminalControllerCloseSurfaceCallback(
    userdata: UnsafeMutableRawPointer?,
    processAlive: Bool,
) {
    TerminalCallbacks.closeSurface(userdata: userdata, processAlive: processAlive)
}

func terminalControllerWriteClipboardCallback(
    userdata: UnsafeMutableRawPointer?,
    clipboard: ghostty_clipboard_e,
    contents: UnsafePointer<ghostty_clipboard_content_s>?,
    contentsLen: Int,
    confirm: Bool,
) {
    TerminalCallbacks.writeClipboard(
        userdata: userdata,
        clipboard: clipboard,
        contents: contents,
        contentsLen: contentsLen,
        confirm: confirm,
    )
}

func terminalControllerReadClipboardCallback(
    userdata: UnsafeMutableRawPointer?,
    clipboard: ghostty_clipboard_e,
    statePtr: UnsafeMutableRawPointer?,
    mimes: UnsafePointer<UnsafePointer<CChar>?>?,
    mimesLen: Int,
    listAvailable: Bool,
) -> ghostty_clipboard_read_result_e {
    TerminalCallbacks.readClipboard(
        userdata: userdata,
        clipboard: clipboard,
        statePtr: statePtr,
        mimes: mimes,
        mimesLen: mimesLen,
        listAvailable: listAvailable,
    )
}

func terminalControllerConfirmReadClipboardCallback(
    userdata: UnsafeMutableRawPointer?,
    confirm: UnsafePointer<ghostty_clipboard_confirm_s>?,
    statePtr: UnsafeMutableRawPointer?,
    request: ghostty_clipboard_request_e,
) {
    TerminalCallbacks.confirmReadClipboard(
        userdata: userdata,
        confirm: confirm,
        statePtr: statePtr,
        request: request,
    )
}
