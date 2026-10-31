package expo.modules.termixdisplay

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TermixDisplayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TermixDisplay")
    Constant("ready") { true }

    View(TermixDisplayView::class) {
      Events("onKey")
      Prop("frameId") { view: TermixDisplayView, id: String? -> view.setFrameId(id) }
      Prop("placement") { view: TermixDisplayView, p: List<Double>? ->
        val v = p ?: listOf(1.0, 0.0, 0.0)
        view.setPlacement(v.getOrElse(0) { 1.0 }.toFloat(), v.getOrElse(1) { 0.0 }.toFloat(), v.getOrElse(2) { 0.0 }.toFloat())
      }
      AsyncFunction("focus") { view: TermixDisplayView -> view.requestFocus() }
      OnViewDestroys { view: TermixDisplayView -> view.destroy() }
    }
  }
}
