// swift-tools-version:6.2
// Parser throughput for SwiftTerm at the tag the iOS module vendors.
//
//   swift run -c release Bench <fixtures dir>/*.bin
import PackageDescription

let package = Package(
    name: "Bench",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/migueldeicaza/SwiftTerm.git", exact: "1.99.1"),
    ],
    targets: [
        .executableTarget(
            name: "Bench",
            dependencies: [.product(name: "SwiftTerm", package: "SwiftTerm")]
        ),
    ]
)
