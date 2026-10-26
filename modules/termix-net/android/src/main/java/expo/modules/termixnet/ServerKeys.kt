package expo.modules.termixnet

import java.net.InetSocketAddress
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SNIHostName
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager

// Looks at a server's certificate before it is trusted. Nothing is sent but
// the TLS handshake.
object ServerKeys {
  private object AcceptAll : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}

    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}

    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  }

  fun peek(host: String, port: Int): Map<String, Any?> {
    val ssl = SSLContext.getInstance("TLS")
    ssl.init(null, arrayOf(AcceptAll), SecureRandom())
    val socket = ssl.socketFactory.createSocket() as SSLSocket
    socket.use {
      it.soTimeout = 8000
      // SNI takes names only, not IP addresses.
      if (host.any { c -> c.isLetter() } && !host.contains(':')) {
        val params = it.sslParameters
        params.serverNames = listOf(SNIHostName(host))
        it.sslParameters = params
      }
      it.connect(InetSocketAddress(host, port), 8000)
      it.startHandshake()
      val leaf = it.session.peerCertificates.first() as X509Certificate
      return mapOf(
        "pin" to ServerPins.spki(leaf),
        "subject" to leaf.subjectX500Principal.name,
        "issuer" to leaf.issuerX500Principal.name,
        "notAfter" to leaf.notAfter.time.toDouble(),
        "selfSigned" to (leaf.subjectX500Principal == leaf.issuerX500Principal),
      )
    }
  }
}
