// swift-tools-version:5.9
import PackageDescription

// Native slices come from russh/build-ios.sh and libssh2/build-ios.sh.
let package = Package(
    name: "TermixSshHarness",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(name: "SshApi", targets: ["SshApi"]),
        .library(name: "RusshEngine", targets: ["RusshEngine"]),
        .library(name: "Libssh2Engine", targets: ["Libssh2Engine"]),
    ],
    targets: [
        .target(name: "SshApi"),
        .binaryTarget(name: "TermixSshCore", path: "../../build/ios/TermixSshCore.xcframework"),
        .target(name: "RusshEngine", dependencies: ["SshApi", "TermixSshCore"]),
        .binaryTarget(name: "TermixSsh2", path: "../../build/ios/TermixSsh2.xcframework"),
        .target(name: "Libssh2Engine", dependencies: ["SshApi", "TermixSsh2"]),
        .testTarget(
            name: "ScenarioTests",
            dependencies: ["SshApi", "RusshEngine", "Libssh2Engine"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
