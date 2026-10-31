package expo.modules.termixnet

import android.app.Application
import android.content.Context
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package
import java.security.KeyStore
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import okhttp3.OkHttpClient

// Every React Native request, fetch stream and WebSocket is built from this
// factory, so a saved client certificate is presented on all of them, and a
// pinned server key is checked on all of them.
class TermixNetPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(
      object : ApplicationLifecycleListener {
        override fun onCreate(application: Application) {
          OkHttpClientProvider.setOkHttpClientFactory(CertClientFactory(application))
        }
      },
    )
}

class CertClientFactory(private val context: Context) : OkHttpClientFactory {
  override fun createNewNetworkModuleClient(): OkHttpClient {
    // The default trust manager keeps the app's network security config.
    val trustFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    trustFactory.init(null as KeyStore?)
    val system = trustFactory.trustManagers.first { it is X509TrustManager } as X509TrustManager
    val trust = ServerPins.TrustManager(context, system)
    val ssl = SSLContext.getInstance("TLS")
    ssl.init(arrayOf(ClientCerts.KeyManager(context)), arrayOf(trust), null)
    return OkHttpClientProvider.createClientBuilder(context)
      .sslSocketFactory(ssl.socketFactory, trust)
      .hostnameVerifier(ServerPins.Verifier(context))
      .build()
  }
}
