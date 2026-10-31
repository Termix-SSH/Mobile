package expo.modules.termixpipe

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TermixPipeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TermixPipe")
    Constant("ready") { true }
  }
}
