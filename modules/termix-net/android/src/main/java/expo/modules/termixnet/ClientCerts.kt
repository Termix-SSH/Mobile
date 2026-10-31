package expo.modules.termixnet

import android.content.Context
import android.security.keystore.KeyProperties
import android.security.keystore.KeyProtection
import android.util.Base64
import java.io.ByteArrayInputStream
import java.net.Socket
import java.security.KeyStore
import java.security.Principal
import java.security.PrivateKey
import java.security.cert.X509Certificate
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509ExtendedKeyManager

// Client certificates for servers behind mTLS. The key goes into the Android
// Keystore and can't be read back out; we only keep which host uses which one.
object ClientCerts {
  private const val PREFS = "termix_net"
  private const val KEYSTORE = "AndroidKeyStore"

  private fun aliasFor(accountId: String) = "termix.$accountId"

  private fun keystore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun import(context: Context, accountId: String, host: String, pfxBase64: String, passphrase: String): Map<String, Any?> {
    val pkcs12 = KeyStore.getInstance("PKCS12")
    val password = passphrase.toCharArray()
    try {
      pkcs12.load(ByteArrayInputStream(Base64.decode(pfxBase64, Base64.DEFAULT)), password)
    } catch (e: Exception) {
      throw CertException("BAD_PASSPHRASE", "The file or its passphrase is wrong.")
    }
    val entryAlias = pkcs12.aliases().toList().firstOrNull { pkcs12.isKeyEntry(it) }
      ?: throw CertException("NO_KEY", "The file has no private key.")
    val key = pkcs12.getKey(entryAlias, password) as PrivateKey
    val chain = pkcs12.getCertificateChain(entryAlias)
      ?: throw CertException("NO_KEY", "The file has no certificate.")
    val leaf = chain[0] as X509Certificate

    val protection = KeyProtection.Builder(KeyProperties.PURPOSE_SIGN)
      .setDigests(
        KeyProperties.DIGEST_NONE,
        KeyProperties.DIGEST_SHA256,
        KeyProperties.DIGEST_SHA384,
        KeyProperties.DIGEST_SHA512,
      )
    if (key.algorithm == "RSA") {
      protection.setSignaturePaddings(
        KeyProperties.SIGNATURE_PADDING_RSA_PKCS1,
        KeyProperties.SIGNATURE_PADDING_RSA_PSS,
      )
    }
    val alias = aliasFor(accountId)
    keystore().setEntry(alias, KeyStore.PrivateKeyEntry(key, chain), protection.build())

    val edit = prefs(context).edit()
    for ((name, value) in prefs(context).all) {
      if (name.startsWith("host.") && value == alias) edit.remove(name)
    }
    edit.putString("host.${host.lowercase()}", alias).apply()

    return mapOf(
      "subject" to leaf.subjectX500Principal.name,
      "notAfter" to leaf.notAfter.time.toDouble(),
    )
  }

  fun remove(context: Context, accountId: String) {
    val alias = aliasFor(accountId)
    try {
      keystore().deleteEntry(alias)
    } catch (_: Exception) {}
    val edit = prefs(context).edit()
    for ((name, value) in prefs(context).all) {
      if (name.startsWith("host.") && value == alias) edit.remove(name)
    }
    edit.apply()
  }

  fun has(accountId: String): Boolean =
    try {
      keystore().containsAlias(aliasFor(accountId))
    } catch (_: Exception) {
      false
    }

  /** Picks the certificate saved for the host the TLS handshake is with. */
  class KeyManager(private val context: Context) : X509ExtendedKeyManager() {
    private fun aliasForHost(host: String?): String? {
      if (host.isNullOrEmpty()) return null
      val alias = prefs(context).getString("host.${host.lowercase()}", null) ?: return null
      return if (keystore().containsAlias(alias)) alias else null
    }

    override fun chooseClientAlias(keyType: Array<out String>?, issuers: Array<out Principal>?, socket: Socket?): String? {
      val host = (socket as? SSLSocket)?.handshakeSession?.peerHost ?: socket?.inetAddress?.hostName
      return aliasForHost(host)
    }

    override fun chooseEngineClientAlias(keyType: Array<out String>?, issuers: Array<out Principal>?, engine: SSLEngine?): String? =
      aliasForHost(engine?.peerHost)

    override fun getCertificateChain(alias: String?): Array<X509Certificate>? =
      keystore().getCertificateChain(alias)?.map { it as X509Certificate }?.toTypedArray()

    override fun getPrivateKey(alias: String?): PrivateKey? = keystore().getKey(alias, null) as? PrivateKey

    override fun getClientAliases(keyType: String?, issuers: Array<out Principal>?): Array<String>? = null

    override fun getServerAliases(keyType: String?, issuers: Array<out Principal>?): Array<String>? = null

    override fun chooseServerAlias(keyType: String?, issuers: Array<out Principal>?, socket: Socket?): String? = null
  }
}

class CertException(val code: String, message: String) : Exception(message)
