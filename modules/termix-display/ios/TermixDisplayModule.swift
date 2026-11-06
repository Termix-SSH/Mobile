import ExpoModulesCore

public class TermixDisplayModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TermixDisplay")
    Constant("ready") { true }

    View(TermixDisplayView.self) {
      Events("onKey", "onPointer")
      Prop("frameId") { (view: TermixDisplayView, id: String?) in view.setFrameId(id) }
      Prop("placement") { (view: TermixDisplayView, p: [Double]?) in
        let v = p ?? [1, 0, 0]
        view.setPlacement(
          scale: CGFloat(v.count > 0 ? v[0] : 1),
          offsetX: CGFloat(v.count > 1 ? v[1] : 0),
          offsetY: CGFloat(v.count > 2 ? v[2] : 0))
      }
      AsyncFunction("focus") { (view: TermixDisplayView) in _ = view.becomeFirstResponder() }.runOnQueue(.main)
    }
  }
}
