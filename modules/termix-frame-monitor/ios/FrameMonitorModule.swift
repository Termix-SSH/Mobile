import ExpoModulesCore

// Log lines and the launch URL for the showcase build that makes store media.
public class FrameMonitorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TermixFrameMonitor")

    // Release builds keep this, unlike console.log. CI greps for it.
    Function("log") { (line: String) in
      NSLog("%@", line)
    }

    // CI starts the app with SIMCTL_CHILD_TERMIX_LAB_URL, since opening a
    // custom scheme URL on the simulator asks for confirmation first.
    Function("launchUrl") { () -> String? in
      ProcessInfo.processInfo.environment["TERMIX_LAB_URL"]
    }
  }
}
