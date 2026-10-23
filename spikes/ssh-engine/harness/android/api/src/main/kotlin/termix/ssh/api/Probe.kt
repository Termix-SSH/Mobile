package termix.ssh.api

/** Touches every engine feature once. The Expo spike modules call it so the size builds keep all code. */
suspend fun probe(engine: SshEngine, config: SshConfig, callbacks: SshCallbacks): String {
    val s = engine.connect(config, callbacks)
    val out = StringBuilder(String(s.exec("uname -a").stdout))
    val sink = object : ShellSink {
        override fun onData(data: ByteArray) {}
        override fun onExit(code: Int?) {}
    }
    val sh = s.openShell("xterm-256color", 80, 24, emptyMap(), sink)
    sh.resize(100, 30)
    sh.close()
    out.append(s.list(".").size)
    s.forwardLocal(0, "127.0.0.1", 22).close()
    s.forwardDynamic(0).close()
    runCatching { s.connectVia(config, callbacks).close() }
    s.close()
    return out.toString()
}
