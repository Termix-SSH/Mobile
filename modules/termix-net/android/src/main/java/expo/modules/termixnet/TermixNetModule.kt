package expo.modules.termixnet

import android.util.Base64
import android.webkit.CookieManager
import com.facebook.react.modules.network.OkHttpClientProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class TermixNetModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("TermixNet")

    // Android sends certificates from the shared OkHttp client, so JS keeps
    // using its own fetch, axios and WebSocket.
    Constant("nativeRequests") { false }

    AsyncFunction("importClientCert") { accountId: String, host: String, pfxBase64: String, passphrase: String ->
      try {
        val info = ClientCerts.import(context, accountId, host, pfxBase64, passphrase)
        // Pooled connections were made without the certificate.
        OkHttpClientProvider.getOkHttpClient().connectionPool.evictAll()
        info
      } catch (e: CertException) {
        throw CodedException(e.code, e.message, e)
      }
    }

    AsyncFunction("removeClientCert") { accountId: String ->
      ClientCerts.remove(context, accountId)
      OkHttpClientProvider.getOkHttpClient().connectionPool.evictAll()
    }

    AsyncFunction("hasClientCert") { accountId: String -> ClientCerts.has(accountId) }

    AsyncFunction("setServerPins") { host: String, pins: List<String> ->
      ServerPins.set(context, host, pins)
      // Pooled connections were checked without the new pins.
      OkHttpClientProvider.getOkHttpClient().connectionPool.evictAll()
    }

    // Reads the key a server shows, without trusting it, so the user can pin it.
    AsyncFunction("peekServerKey") { host: String, port: Int ->
      try {
        ServerKeys.peek(host, port)
      } catch (e: Exception) {
        throw CodedException("PEEK_FAILED", e.message ?: "Could not reach the server", e)
      }
    }

    AsyncFunction("tcpProbe") { host: String, port: Int, timeoutMs: Int ->
      try {
        Socket().use { it.connect(InetSocketAddress(host, port), maxOf(timeoutMs, 100)) }
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("udpSend") { host: String, port: Int, base64: String ->
      try {
        val data = Base64.decode(base64, Base64.DEFAULT)
        DatagramSocket().use { socket ->
          socket.broadcast = true
          socket.send(DatagramPacket(data, data.size, InetAddress.getByName(host), port))
        }
        null
      } catch (e: Exception) {
        throw CodedException("UDP_FAILED", e.message ?: "Could not send the packet", e)
      }
    }

    // The web view and React Native share this jar on Android.
    AsyncFunction("readWebCookies") { url: String -> readCookies(url) }

    AsyncFunction("readJarCookies") { url: String -> readCookies(url) }

    // Keeps expiry, so a persistent proxy cookie stays one after a restart.
    AsyncFunction("setCookies") { url: String, cookies: List<Map<String, Any?>> ->
      val manager = CookieManager.getInstance()
      for (cookie in cookies) {
        val name = cookie["name"] as? String ?: continue
        val value = cookie["value"] as? String ?: ""
        val path = cookie["path"] as? String ?: "/"
        val parts = mutableListOf("$name=$value", "Path=$path")
        (cookie["domain"] as? String)?.takeIf { it.startsWith(".") }?.let { parts.add("Domain=$it") }
        (cookie["expires"] as? Number)?.let { parts.add("Expires=${httpDate(it.toLong())}") }
        if (cookie["secure"] == true) parts.add("Secure")
        if (cookie["httpOnly"] == true) parts.add("HttpOnly")
        manager.setCookie(url, parts.joinToString("; "))
      }
      manager.flush()
    }

    AsyncFunction("clearCookie") { url: String, name: String ->
      val manager = CookieManager.getInstance()
      manager.setCookie(url, "$name=; Max-Age=0; Path=/")
      manager.flush()
    }

    AsyncFunction("clearWebCookies") { url: String ->
      val manager = CookieManager.getInstance()
      val raw = manager.getCookie(url) ?: return@AsyncFunction null
      for (part in raw.split(";")) {
        val name = part.substringBefore("=").trim()
        if (name.isNotEmpty()) manager.setCookie(url, "$name=; Max-Age=0; Path=/")
      }
      manager.flush()
      null
    }
  }

  private fun readCookies(url: String): List<Map<String, String>> {
    val manager = CookieManager.getInstance()
    manager.flush()
    val raw = manager.getCookie(url) ?: return emptyList()
    return raw.split(";").mapNotNull { part ->
      val index = part.indexOf('=')
      if (index <= 0) {
        null
      } else {
        mapOf("name" to part.substring(0, index).trim(), "value" to part.substring(index + 1).trim())
      }
    }
  }

  private fun httpDate(ms: Long): String {
    val format = SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.US)
    format.timeZone = TimeZone.getTimeZone("GMT")
    return format.format(Date(ms))
  }
}
