package expo.modules.termixtailscale

import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Android bridge for the Termix Tailscale userspace library.
 *
 * Loads libtermix_ts.so (Go tsnet) + libtermix_ts_jni.so (C JNI bridge). All
 * TermixTS_* C functions are exposed here as native methods.
 */
class TermixTailscaleModule : Module() {
  @Volatile private var libraryLoaded = false
  @Volatile private var nativeLoadError: String? = null

  private companion object {
    const val TAG = "TermixTailscale"
    const val SUPPORTED_ABI = "arm64-v8a"
  }

  // -- JNI bindings (see src/main/cpp/termix_ts_jni.c) ---------------------
  private external fun nativeConfigure(
    authKey: String,
    hostname: String,
    stateDir: String,
    ephemeral: Boolean,
  ): Int

  private external fun nativeUp(): Int
  private external fun nativeClose(): Int
  private external fun nativeStartForward(
    protocol: String,
    remoteHost: String,
    remotePort: Int,
  ): Int
  private external fun nativeStopForward(
    protocol: String,
    remoteHost: String,
    remotePort: Int,
    localPort: Int,
  ): Int

  private external fun nativeStopAllForwards(): Int
  private external fun nativeIsForwardActive(
    protocol: String,
    remoteHost: String,
    remotePort: Int,
    localPort: Int,
  ): Boolean
  private external fun nativeIsUp(): Boolean
  private external fun nativeGetIPs(): String
  private external fun nativeLastError(): String

  override fun definition() = ModuleDefinition {
    Name("TermixTailscale")

    OnCreate {
      libraryLoaded = loadNativeLibraries()
    }

    Function("isAvailable") {
      libraryLoaded
    }

    Function("getNativeLoadError") {
      nativeLoadError ?: ""
    }

    AsyncFunction("getDefaultStateDir") {
      val base = appContext.reactContext?.filesDir
        ?: throw Exception("No Android filesDir")
      val dir = File(base, "TermixTailscale")
      if (!dir.exists()) dir.mkdirs()
      dir.absolutePath
    }

    AsyncFunction("configure") { options: Map<String, Any?> ->
      ensureLoaded()
      val authKey = options["authKey"] as? String ?: ""
      val hostname = options["hostname"] as? String ?: "termix-mobile"
      val stateDir = options["stateDir"] as? String
        ?: appContext.reactContext?.filesDir?.absolutePath ?: ""
      val ephemeral = options["ephemeral"] as? Boolean ?: false

      val rc = nativeConfigure(authKey, hostname, stateDir, ephemeral)
      if (rc != 0) throw Exception(nativeLastError())
    }

    AsyncFunction("up") {
      ensureLoaded()
      val rc = nativeUp()
      if (rc != 0) throw Exception(nativeLastError())
    }

    AsyncFunction("startForward") { protocol: String, remoteHost: String, remotePort: Int ->
      ensureLoaded()
      val localPort = nativeStartForward(protocol, remoteHost, remotePort)
      if (localPort <= 0) throw Exception(nativeLastError())
      localPort
    }

    AsyncFunction("stopForward") { protocol: String, remoteHost: String, remotePort: Int, localPort: Int ->
      ensureLoaded()
      val rc = nativeStopForward(protocol, remoteHost, remotePort, localPort)
      if (rc != 0) throw Exception(nativeLastError())
    }

    AsyncFunction("stopAllForwards") {
      if (libraryLoaded) nativeStopAllForwards()
    }

    AsyncFunction("isForwardActive") { protocol: String, remoteHost: String, remotePort: Int, localPort: Int ->
      if (!libraryLoaded) false else nativeIsForwardActive(protocol, remoteHost, remotePort, localPort)
    }

    AsyncFunction("isUp") {
      if (!libraryLoaded) false else nativeIsUp()
    }

    AsyncFunction("getIPs") {
      if (!libraryLoaded) "" else nativeGetIPs()
    }

    AsyncFunction("close") {
      if (libraryLoaded) {
        val rc = nativeClose()
        if (rc != 0) throw Exception(nativeLastError())
      }
    }
  }

  private fun ensureLoaded() {
    if (!libraryLoaded) {
      val detail = nativeLoadError?.let { ": $it" } ?: ""
      throw Exception(
        "Termix Tailscale native library not loaded$detail. " +
          "Run: make -C modules/termix-tailscale/native android"
      )
    }
  }

  private fun loadNativeLibraries(): Boolean {
    nativeLoadError = null
    return try {
      System.loadLibrary("termix_ts")
      System.loadLibrary("termix_ts_jni")
      true
    } catch (error: UnsatisfiedLinkError) {
      recordNativeLoadFailure(error)
      false
    } catch (error: SecurityException) {
      recordNativeLoadFailure(error)
      false
    }
  }

  private fun recordNativeLoadFailure(error: Throwable) {
    val rawReason = error.message
      ?.replace(Regex("\\s+"), " ")
      ?.trim()
      ?.take(512)
    val reason = if (rawReason.isNullOrEmpty()) {
      error::class.java.simpleName
    } else {
      rawReason
    }
    val deviceAbis = Build.SUPPORTED_ABIS
      .joinToString(",")
      .ifEmpty { "unknown" }
    nativeLoadError = "$reason (device ABIs: $deviceAbis; this build: $SUPPORTED_ABI)"
    Log.e(TAG, "Unable to load Tailscale native libraries: $nativeLoadError", error)
  }
}
