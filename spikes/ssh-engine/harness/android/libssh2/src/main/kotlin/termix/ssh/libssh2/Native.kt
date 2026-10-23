package termix.ssh.libssh2

/** Thrown from C with the tx_error code and message. */
class NativeError(val code: Int, message: String) : Exception(message)

class NativeEntry(
    @JvmField val name: String,
    @JvmField val size: Long,
    @JvmField val isDir: Boolean,
    @JvmField val isSymlink: Boolean,
    @JvmField val permissions: Int,
    @JvmField val mtime: Int,
)

/** Called from the session thread. Blocking here pauses only that session. */
interface NativeCallbacks {
    fun verifyHostKey(type: String, blobHex: String, sha256: String, isCert: Boolean, caSha256: String, principals: String): Boolean
    fun keyboardInteractive(name: String, instructions: String, prompts: Array<String>, echo: BooleanArray, round: Int): Array<String>?
    fun onBanner(banner: String)
    fun onDisconnect(reason: String)
}

interface NativeShellCallbacks {
    fun onData(data: ByteArray)
    fun onExit(hasCode: Boolean, code: Int)
}

interface NativeProgress {
    fun onProgress(done: Long, total: Long)
}

object Native {
    init {
        System.loadLibrary("termix_ssh2")
    }

    @JvmStatic external fun connect(
        parent: Long, host: String, port: Int, user: String, password: String?, key: String?, passphrase: String?,
        cert: String?, forceKbd: Boolean, legacy: Boolean, timeout: Int, kaInterval: Int, kaMax: Int,
        callbacks: NativeCallbacks,
    ): Long
    @JvmStatic external fun algorithms(h: Long): Array<String>
    @JvmStatic external fun isClosed(h: Long): Boolean
    @JvmStatic external fun free(h: Long)
    @JvmStatic external fun exec(h: Long, command: String): Array<Any>
    @JvmStatic external fun shellOpen(h: Long, term: String, cols: Int, rows: Int, names: Array<String>, values: Array<String>, cb: NativeShellCallbacks): Long
    @JvmStatic external fun shellWrite(sh: Long, data: ByteArray)
    @JvmStatic external fun shellResize(sh: Long, cols: Int, rows: Int)
    @JvmStatic external fun shellClose(sh: Long)
    @JvmStatic external fun shellFree(sh: Long)
    @JvmStatic external fun sftpList(h: Long, path: String): Array<NativeEntry>
    @JvmStatic external fun sftpDownload(h: Long, remote: String, local: String, progress: NativeProgress?): LongArray
    @JvmStatic external fun sftpUpload(h: Long, local: String, remote: String, progress: NativeProgress?): LongArray
    @JvmStatic external fun sftpRemove(h: Long, path: String)
    @JvmStatic external fun forwardLocal(h: Long, bind: String, bindPort: Int, host: String, port: Int): Long
    @JvmStatic external fun forwardDynamic(h: Long, bind: String, bindPort: Int): Long
    @JvmStatic external fun forwardPort(f: Long): Int
    @JvmStatic external fun forwardClose(f: Long)
    @JvmStatic external fun version(): String
}
