import ExpoModulesCore
import Foundation

public class FileProtectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FileProtection")

    Function("protectDirectory") { (path: String) in
      var url = URL(fileURLWithPath: path, isDirectory: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try url.setResourceValues(values)
      try FileManager.default.setAttributes(
        [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
        ofItemAtPath: path
      )
    }
  }
}
