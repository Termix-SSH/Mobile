const config = require("../app.json").expo;

test("Android never backs up app data", () => {
  expect(config.android.allowBackup).toBe(false);
});

test("the local database is built with SQLCipher", () => {
  const sqlite = config.plugins.find(
    (p: unknown) => Array.isArray(p) && p[0] === "expo-sqlite",
  );
  expect(sqlite?.[1]).toEqual({ useSQLCipher: true });
});

describe("no backups or device transfer", () => {
  const plugin = require("../plugins/withNoBackup.js");

  test("the plugin is on and secure store leaves backup rules to it", () => {
    expect(config.plugins).toContain("./plugins/withNoBackup.js");
    expect(config.plugins).toContainEqual([
      "expo-secure-store",
      { configureAndroidBackup: false },
    ]);
  });

  test("cloud backup and device transfer both exclude every kind of storage", () => {
    const rules: string = plugin.DATA_EXTRACTION_RULES;
    for (const section of ["cloud-backup", "device-transfer"]) {
      const body = rules.split(`<${section}>`)[1].split(`</${section}>`)[0];
      for (const domain of [
        "root",
        "file",
        "database",
        "sharedpref",
        "external",
      ]) {
        expect(body).toContain(`<exclude domain="${domain}" path="." />`);
      }
    }
    expect(plugin.FULL_BACKUP_CONTENT).toContain(
      '<exclude domain="database" path="." />',
    );
  });

  test("the manifest points at the rules", async () => {
    const out = plugin({ name: "t", slug: "t" });
    const manifest = {
      manifest: {
        application: [{ $: { "android:name": ".MainApplication" } }],
      },
    };
    const result = await out.mods.android.manifest({
      ...out,
      modResults: manifest,
      modRequest: { platform: "android", modName: "manifest" },
    });
    expect(result.modResults.manifest.application[0].$).toMatchObject({
      "android:allowBackup": "false",
      "android:dataExtractionRules": "@xml/termix_data_extraction_rules",
      "android:fullBackupContent": "@xml/termix_backup_rules",
    });
  });
});

describe("web view pins", () => {
  const plugin = require("../plugins/withWebViewPins.js");
  const OLD_ANDROID = [
    "import java.net.InetAddress;",
    "import java.net.URI;",
    "public class RNCWebViewClient {",
    "    private static boolean isTermixLocalNetworkHost(String url) {",
    "        return true;",
    "    }",
    "",
    "    @Override",
    "    public void onReceivedSslError(final WebView webView, final SslErrorHandler handler, final SslError error) {",
    "        String failingUrl = error.getUrl();",
    "",
    "        if (isTermixLocalNetworkHost(failingUrl)) {",
    "            handler.proceed();",
    "            return;",
    "        }",
    "",
    "        // Cancel request after obtaining top-level URL.",
    "        handler.cancel();",
    "    }",
    "}",
  ].join("\n");

  test("the old LAN bypass is no longer used", () => {
    expect(config.plugins).toContain("./plugins/withWebViewPins.js");
    expect(config.plugins).not.toContain(
      "./plugins/withAndroidLocalNetworkSsl.js",
    );
  });

  test("Android proceeds only for a pinned key, and the old bypass is gone", () => {
    const out = plugin.patchAndroid(OLD_ANDROID);
    expect(out).not.toContain("isTermixLocalNetworkHost");
    expect(out).toContain('"matchesWebCertificate"');
    expect(out.indexOf("matchesWebCertificate")).toBeLessThan(
      out.indexOf("handler.cancel()"),
    );
    expect(plugin.patchAndroid(out)).toBe(out);
  });

  test("iOS answers pinned hosts by key, and refuses a changed key", () => {
    const objc = [
      "{",
      "  if ([[challenge protectionSpace] authenticationMethod] == NSURLAuthenticationMethodClientCertificate) {",
      "  }",
      "}",
    ].join("\n");
    const out = plugin.patchIos(objc);
    expect(out).toContain('NSSelectorFromString(@"pinState:host:")');
    expect(out).toContain(
      "NSURLSessionAuthChallengeCancelAuthenticationChallenge",
    );
    expect(plugin.patchIos(out)).toBe(out);
  });
});
