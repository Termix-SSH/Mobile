package expo.modules.termixnet

import android.content.Context
import android.net.http.SslCertificate
import android.os.Build
import android.util.Base64
import java.io.ByteArrayInputStream
import java.net.Socket
import java.net.URI
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSession
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509ExtendedTrustManager
import javax.net.ssl.X509TrustManager

// Pinned server keys, per host. A pinned host is trusted by its key alone, so
// a self-signed server works, and a different key is refused even when a
// trusted authority signed it.
object ServerPins {
  private const val PREFS = "termix_net"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun set(context: Context, host: String, pins: List<String>) {
    val key = "pin.${host.lowercase()}"
    val edit = prefs(context).edit()
    if (pins.isEmpty()) edit.remove(key) else edit.putString(key, pins.joinToString(","))
    edit.apply()
  }

  fun get(context: Context, host: String?): List<String> {
    if (host.isNullOrEmpty()) return emptyList()
    val saved = prefs(context).getString("pin.${host.lowercase()}", null) ?: return emptyList()
    return saved.split(",").filter { it.isNotEmpty() }
  }

  /** base64 sha256 of the certificate's SubjectPublicKeyInfo. */
  fun spki(cert: X509Certificate): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(cert.publicKey.encoded)
    return Base64.encodeToString(digest, Base64.NO_WRAP)
  }

  fun matches(context: Context, host: String?, cert: X509Certificate?): Boolean {
    val pins = get(context, host)
    return cert != null && pins.isNotEmpty() && pins.contains(spki(cert))
  }

  /** For the web view's SSL error: proceed only for a pinned key. */
  @JvmStatic
  fun matchesWebCertificate(context: Context, url: String?, certificate: SslCertificate?): Boolean {
    val host = try {
      URI(url).host
    } catch (_: Exception) {
      null
    }
    return matches(context, host, x509Of(certificate))
  }

  private fun x509Of(certificate: SslCertificate?): X509Certificate? {
    if (certificate == null) return null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return certificate.x509Certificate
    // Older Android keeps the DER bytes in the saved state.
    val der = SslCertificate.saveState(certificate)?.getByteArray("x509-certificate") ?: return null
    return CertificateFactory.getInstance("X.509")
      .generateCertificate(ByteArrayInputStream(der)) as X509Certificate
  }

  /** Wraps the system trust: unpinned hosts are checked as before. */
  class TrustManager(
    private val context: Context,
    private val system: X509TrustManager,
  ) : X509ExtendedTrustManager() {
    private fun check(chain: Array<out X509Certificate>, authType: String, host: String?, fallback: () -> Unit) {
      val pins = get(context, host)
      if (pins.isEmpty()) return fallback()
      val leaf = chain.firstOrNull()
      if (leaf == null || !pins.contains(spki(leaf))) {
        throw CertificateException("PIN_MISMATCH: the server's key is not the pinned one")
      }
    }

    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String, socket: Socket?) {
      val host = (socket as? SSLSocket)?.handshakeSession?.peerHost
      check(chain, authType, host) {
        (system as? X509ExtendedTrustManager)?.checkServerTrusted(chain, authType, socket)
          ?: system.checkServerTrusted(chain, authType)
      }
    }

    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String, engine: SSLEngine?) {
      check(chain, authType, engine?.peerHost) {
        (system as? X509ExtendedTrustManager)?.checkServerTrusted(chain, authType, engine)
          ?: system.checkServerTrusted(chain, authType)
      }
    }

    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) =
      system.checkServerTrusted(chain, authType)

    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String, socket: Socket?) =
      system.checkClientTrusted(chain, authType)

    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String, engine: SSLEngine?) =
      system.checkClientTrusted(chain, authType)

    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) =
      system.checkClientTrusted(chain, authType)

    override fun getAcceptedIssuers(): Array<X509Certificate> = system.acceptedIssuers
  }

  /** A pinned key stands in for the name check, which self-signed certs often fail. */
  class Verifier(private val context: Context) : HostnameVerifier {
    private val system = HttpsURLConnection.getDefaultHostnameVerifier()

    override fun verify(hostname: String?, session: SSLSession?): Boolean {
      if (get(context, hostname).isNotEmpty()) {
        val leaf = session?.peerCertificates?.firstOrNull() as? X509Certificate
        return matches(context, hostname, leaf)
      }
      return system.verify(hostname, session)
    }
  }
}
