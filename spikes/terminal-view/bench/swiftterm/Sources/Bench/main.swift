import Foundation
import SwiftTerm

final class Sink: TerminalDelegate {
    func send(source: Terminal, data: ArraySlice<UInt8>) {}
}

func run(_ data: [UInt8]) -> Double {
    let sink = Sink()
    var options = TerminalOptions.default
    options.cols = 120
    options.rows = 40
    options.scrollback = 10000
    let term = Terminal(delegate: sink, options: options)
    let chunk = 64 * 1024
    let start = DispatchTime.now().uptimeNanoseconds
    var i = 0
    while i < data.count {
        let end = min(i + chunk, data.count)
        term.feed(buffer: data[i..<end])
        i = end
    }
    return Double(DispatchTime.now().uptimeNanoseconds - start) / 1e6
}

func rssMb() -> Int {
    var usage = rusage()
    getrusage(RUSAGE_SELF, &usage)
    // macOS reports bytes.
    return Int(usage.ru_maxrss / 1_048_576)
}

for path in CommandLine.arguments.dropFirst() {
    guard let file = FileManager.default.contents(atPath: path) else {
        FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!)
        exit(1)
    }
    let data = [UInt8](file)
    _ = run(Array(data.prefix(1_048_576)))
    let ms = run(data)
    let mb = Double(data.count) / 1_048_576
    let name = (path as NSString).lastPathComponent
    print(String(
        format: "TXBENCH {\"engine\":\"swiftterm\",\"fixture\":\"%@\",\"mb\":%.1f,\"ms\":%.0f,\"mbps\":%.1f,\"rssMb\":%d}",
        name, mb, ms, mb / (ms / 1000), rssMb()))
}
