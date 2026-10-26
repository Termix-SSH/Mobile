// Lets web views trust a server by its pinned key (termix-net ServerPins).
// Android: a certificate error proceeds only when the key is pinned for the
// host. iOS: a pinned host is answered by its key, matching or refused.
// The web view can't link termix-net, so it finds the check by class name.
// This replaces the old patch that trusted any certificate on a LAN address.
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const ANDROID_CLIENT = path.join(
  "node_modules/react-native-webview/android/src/main/java",
  "com/reactnativecommunity/webview/RNCWebViewClient.java",
);
const IOS_IMPL = "node_modules/react-native-webview/apple/RNCWebViewImpl.m";

const ANDROID_MARKER = "Termix: a pinned server key";
const ANDROID_ANCHOR =
  "        // Cancel request after obtaining top-level URL.\n";
const ANDROID_PATCH = `        // ${ANDROID_MARKER} lets a self-signed server through.
        try {
            Object ok = Class.forName("expo.modules.termixnet.ServerPins")
                .getMethod("matchesWebCertificate", android.content.Context.class, String.class, android.net.http.SslCertificate.class)
                .invoke(null, webView.getContext(), failingUrl, error.getCertificate());
            if (Boolean.TRUE.equals(ok)) {
                handler.proceed();
                return;
            }
        } catch (Exception ignored) {
        }

`;

const IOS_MARKER = "Termix: a pinned server key";
const IOS_ANCHOR =
  "  if ([[challenge protectionSpace] authenticationMethod] == NSURLAuthenticationMethodClientCertificate) {";
const IOS_PATCH = `  // ${IOS_MARKER} answers for its host.
  if ([[challenge protectionSpace] serverTrust] != nil) {
    Class termixPins = NSClassFromString(@"TermixServerPins");
    SEL termixSel = NSSelectorFromString(@"pinState:host:");
    if (termixPins != nil && [termixPins respondsToSelector:termixSel]) {
      SecTrustRef termixTrust = [[challenge protectionSpace] serverTrust];
      NSInteger (*pinState)(id, SEL, id, NSString *) =
        (NSInteger (*)(id, SEL, id, NSString *))[termixPins methodForSelector:termixSel];
      NSInteger state = pinState(termixPins, termixSel, (__bridge id)termixTrust, challenge.protectionSpace.host);
      if (state == 1) {
        completionHandler(NSURLSessionAuthChallengeUseCredential, [NSURLCredential credentialForTrust:termixTrust]);
        return;
      }
      if (state == 2) {
        completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
        return;
      }
    }
  }
`;

/** Takes out the old LAN bypass, from a node_modules patched by an older build. */
function removeLanBypass(java) {
  return java
    .replace(
      /\n {4}private static boolean isTermixLocalNetworkHost\(String url\) \{[\s\S]*?\n {4}\}\n\n/,
      "\n",
    )
    .replace(
      / {8}if \(isTermixLocalNetworkHost\(failingUrl\)\) \{\n {12}handler\.proceed\(\);\n {12}return;\n {8}\}\n\n/,
      "",
    )
    .replace(
      "import java.net.InetAddress;\nimport java.net.URI;\n",
      "import java.net.InetAddress;\n",
    );
}

function insertOnce(contents, marker, patch, anchor, file) {
  if (contents.includes(marker)) return contents;
  if (!contents.includes(anchor)) {
    throw new Error(`Unable to patch ${file}: missing anchor`);
  }
  return contents.replace(anchor, `${patch}${anchor}`);
}

function patchAndroid(java) {
  return insertOnce(
    removeLanBypass(java),
    ANDROID_MARKER,
    ANDROID_PATCH,
    ANDROID_ANCHOR,
    "RNCWebViewClient.java",
  );
}

function patchIos(objc) {
  return insertOnce(
    objc,
    IOS_MARKER,
    IOS_PATCH,
    IOS_ANCHOR,
    "RNCWebViewImpl.m",
  );
}

function patchFile(root, file, patch) {
  const full = path.join(root, file);
  if (!fs.existsSync(full))
    throw new Error(`react-native-webview not found: ${full}`);
  fs.writeFileSync(full, patch(fs.readFileSync(full, "utf8")));
}

const withWebViewPins = (config) => {
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      patchFile(config.modRequest.projectRoot, ANDROID_CLIENT, patchAndroid);
      return config;
    },
  ]);
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      patchFile(config.modRequest.projectRoot, IOS_IMPL, patchIos);
      return config;
    },
  ]);
  return config;
};

module.exports = withWebViewPins;
module.exports.patchAndroid = patchAndroid;
module.exports.patchIos = patchIos;
