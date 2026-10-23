import ExpoModulesCore
import QuartzCore
import UIKit

// Frame timing and memory for the terminal lab. The display link runs on the
// main thread, so long intervals mean the main thread missed vsync.
public class FrameMonitorModule: Module {
  private var link: CADisplayLink?
  private var last: CFTimeInterval = 0
  private var intervals: [Double] = []

  @objc private func tick(_ link: CADisplayLink) {
    if last != 0, intervals.count < 20_000 {
      intervals.append((link.timestamp - last) * 1000)
    }
    last = link.timestamp
  }

  public func definition() -> ModuleDefinition {
    Name("TermixFrameMonitor")

    // Release builds keep this, unlike console.log. CI greps for it.
    Function("log") { (line: String) in
      NSLog("%@", line)
    }

    Function("refreshRate") { () -> Double in
      Double(UIScreen.main.maximumFramesPerSecond)
    }

    AsyncFunction("start") {
      self.link?.invalidate()
      self.intervals = []
      self.last = 0
      let link = CADisplayLink(target: self, selector: #selector(self.tick(_:)))
      link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
      link.add(to: .main, forMode: .common)
      self.link = link
    }.runOnQueue(.main)

    AsyncFunction("stop") { () -> [String: [Double]] in
      self.link?.invalidate()
      self.link = nil
      return ["intervalsMs": self.intervals, "frameTotalsMs": []]
    }.runOnQueue(.main)

    AsyncFunction("memory") { () -> [String: Double] in
      var info = task_vm_info_data_t()
      var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
      let result = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
          task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
        }
      }
      let footprint = result == KERN_SUCCESS ? Double(info.phys_footprint) / 1_048_576 : 0
      return ["residentMb": footprint]
    }
  }
}
