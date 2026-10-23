// Stands in for the file SwiftTerm's SwiftPM build plugin generates, since
// CocoaPods does not run SwiftPM plugins.

/// Source-control information for this SwiftTerm build.
public enum SwiftTermBuildInfo {
    public static let branch: String? = nil
    public static let tag: String? = "v1.99.1"
    public static let commit: String? = "2f573f73af5e768d90847dce20c97fa9535d7164"
    public static let hasUncommittedChanges: Bool? = true
    public static let version: String = "v1.99.1-modified"
}

/// The upstream plugin builds this table from swifterm-terminfo. Left empty
/// here, so XTGETTCAP queries get no answer.
enum SwiftTermTerminfo {
    static let xtgettcapReplies: [String: String] = [:]
}
