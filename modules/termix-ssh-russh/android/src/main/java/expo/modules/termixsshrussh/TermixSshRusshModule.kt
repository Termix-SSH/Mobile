package expo.modules.termixsshrussh

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import termix.ssh.api.HostKey
import termix.ssh.api.KbdRound
import termix.ssh.api.SshCallbacks
import termix.ssh.api.SshConfig
import termix.ssh.api.probe

class TermixSshRusshModule : Module() {
  private val engine = termix.ssh.russh.RusshEngine()

  override fun definition() = ModuleDefinition {
    Name("TermixSshRussh")

    Function("version") { engine.version }

    AsyncFunction("probe") Coroutine { host: String, port: Int, user: String, password: String ->
      probe(engine, SshConfig(host, port, user, password = password), object : SshCallbacks {
        override suspend fun verifyHostKey(key: HostKey) = true
        override suspend fun keyboardInteractive(round: KbdRound): List<String>? = null
        override fun onDisconnect(reason: String) {}
      })
    }
  }
}
