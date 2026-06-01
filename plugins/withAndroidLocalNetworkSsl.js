const {
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WEBVIEW_CLIENT_PATH = path.join(
  "node_modules",
  "react-native-webview",
  "android",
  "src",
  "main",
  "java",
  "com",
  "reactnativecommunity",
  "webview",
  "RNCWebViewClient.java",
);

function addOnce(contents, marker, insert, anchor) {
  if (contents.includes(marker)) return contents;
  if (!contents.includes(anchor)) {
    throw new Error(`Unable to patch Android source: missing anchor ${anchor}`);
  }
  return contents.replace(anchor, `${insert}${anchor}`);
}

function patchWebViewClient(projectRoot) {
  const filePath = path.join(projectRoot, WEBVIEW_CLIENT_PATH);
  if (!fs.existsSync(filePath)) {
    throw new Error(`react-native-webview client not found: ${filePath}`);
  }

  let contents = fs.readFileSync(filePath, "utf8");
  contents = addOnce(
    contents,
    "import java.net.InetAddress;",
    "import java.net.InetAddress;\nimport java.net.URI;\n",
    "import java.util.concurrent.atomic.AtomicReference;\n",
  );

  contents = addOnce(
    contents,
    "isTermixLocalNetworkHost",
    `    private static boolean isTermixLocalNetworkHost(String url) {
        try {
            String host = new URI(url).getHost();
            if (host == null) {
                return false;
            }

            InetAddress address = InetAddress.getByName(host);
            return address.isAnyLocalAddress()
                    || address.isLoopbackAddress()
                    || address.isSiteLocalAddress()
                    || address.isLinkLocalAddress();
        } catch (Exception ignored) {
            return false;
        }
    }

`,
    "    @Override\n    public void onReceivedSslError",
  );

  contents = addOnce(
    contents,
    "isTermixLocalNetworkHost(failingUrl)",
    `        if (isTermixLocalNetworkHost(failingUrl)) {
            handler.proceed();
            return;
        }

`,
    "        // Cancel request after obtaining top-level URL.\n",
  );

  fs.writeFileSync(filePath, contents);
}

function patchKotlinMainApplication(contents) {
  contents = addOnce(
    contents,
    "import com.facebook.react.modules.network.OkHttpClientProvider",
    "import com.facebook.react.modules.network.OkHttpClientProvider\nimport java.net.InetAddress\nimport javax.net.ssl.HttpsURLConnection\n",
    "import expo.modules.ApplicationLifecycleDispatcher\n",
  );

  contents = addOnce(
    contents,
    "isTermixLocalNetworkHost",
    `  private fun isTermixLocalNetworkHost(hostname: String): Boolean {
    return try {
      val address = InetAddress.getByName(hostname)
      address.isAnyLocalAddress ||
        address.isLoopbackAddress ||
        address.isSiteLocalAddress ||
        address.isLinkLocalAddress
    } catch (_: Exception) {
      false
    }
  }

`,
    "  override fun onCreate()",
  );

  return addOnce(
    contents,
    "OkHttpClientProvider.setOkHttpClientFactory",
    `    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder(this)
        .hostnameVerifier { hostname, session ->
          HttpsURLConnection.getDefaultHostnameVerifier().verify(hostname, session) ||
            isTermixLocalNetworkHost(hostname)
        }
        .build()
    }

`,
    "    super.onCreate()\n",
  );
}

function patchJavaMainApplication(contents) {
  contents = addOnce(
    contents,
    "import com.facebook.react.modules.network.OkHttpClientProvider;",
    "import com.facebook.react.modules.network.OkHttpClientProvider;\nimport java.net.InetAddress;\nimport javax.net.ssl.HttpsURLConnection;\n",
    "import expo.modules.ApplicationLifecycleDispatcher;\n",
  );

  contents = addOnce(
    contents,
    "isTermixLocalNetworkHost",
    `  private boolean isTermixLocalNetworkHost(String hostname) {
    try {
      InetAddress address = InetAddress.getByName(hostname);
      return address.isAnyLocalAddress()
          || address.isLoopbackAddress()
          || address.isSiteLocalAddress()
          || address.isLinkLocalAddress();
    } catch (Exception ignored) {
      return false;
    }
  }

`,
    "  @Override\n  public void onCreate()",
  );

  return addOnce(
    contents,
    "OkHttpClientProvider.setOkHttpClientFactory",
    `    OkHttpClientProvider.setOkHttpClientFactory(() ->
      OkHttpClientProvider.createClientBuilder(this)
        .hostnameVerifier((hostname, session) ->
          HttpsURLConnection.getDefaultHostnameVerifier().verify(hostname, session)
            || isTermixLocalNetworkHost(hostname))
        .build()
    );

`,
    "    super.onCreate();\n",
  );
}

const withAndroidLocalNetworkSsl = (config) => {
  config = withMainApplication(config, (config) => {
    const { modResults } = config;
    if (modResults.language === "kt") {
      modResults.contents = patchKotlinMainApplication(modResults.contents);
    } else {
      modResults.contents = patchJavaMainApplication(modResults.contents);
    }
    return config;
  });

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      patchWebViewClient(config.modRequest.projectRoot);
      return config;
    },
  ]);

  return config;
};

module.exports = withAndroidLocalNetworkSsl;
