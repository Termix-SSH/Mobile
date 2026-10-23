import Foundation
import Libssh2Engine
import RusshEngine
import SshApi
import XCTest

final class ScenarioTests: XCTestCase {
    private let res = Bundle.module.resourceURL!.appendingPathComponent("Resources")
    private var env: TestEnv {
        let res = self.res
        let host = ProcessInfo.processInfo.environment["SSH_TEST_HOST"] ?? "127.0.0.1"
        #if os(iOS)
        let platform = "ios-sim-" + UIDeviceVersion.current
        #else
        let platform = "macos"
        #endif
        return TestEnv(
            host: host,
            platform: platform,
            keys: { (try? String(contentsOf: res.appendingPathComponent("keys/\($0)"), encoding: .utf8)) ?? "" },
            algosJson: (try? String(contentsOf: res.appendingPathComponent("algos.json"), encoding: .utf8)) ?? "",
            tempDir: FileManager.default.temporaryDirectory,
            memory: physFootprint,
            record: { print("TXRESULT \($0)") }
        )
    }

    private func wanted(_ name: String) -> Bool {
        ProcessInfo.processInfo.environment["SSH_TEST_ENGINES"].map { $0.split(separator: ",").contains(Substring(name)) } ?? true
    }

    private func suite(_ engine: SshEngine) async {
        print("TXRESULT {\"engine\":\"\(engine.name)\",\"platform\":\"ios\",\"scenario\":\"version\",\"ok\":true,\"detail\":{\"version\":\"\(engine.version)\"}}")
        let failed = await Scenarios(engine, env).all().filter { !$0.ok && $0.required }
        if !failed.isEmpty { XCTFail(failed.map { "\($0.name): \($0.error ?? "")" }.joined(separator: "\n")) }
    }

    func testRussh() async throws {
        try XCTSkipUnless(wanted("russh"))
        await suite(RusshEngine())
    }

    func testLibssh2() async throws {
        try XCTSkipUnless(wanted("libssh2"))
        await suite(Libssh2Engine())
    }
}

#if os(iOS)
import UIKit
enum UIDeviceVersion {
    static var current: String { UIDevice.current.systemVersion }
}
#endif
