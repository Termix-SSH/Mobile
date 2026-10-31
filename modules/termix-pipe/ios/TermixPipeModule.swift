import ExpoModulesCore

public class TermixPipeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TermixPipe")
    Constant("ready") { true }
  }
}
