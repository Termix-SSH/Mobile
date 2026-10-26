import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { WebView } from "react-native-webview";
import type { AccountClient } from "@/core/api/AccountClient";
import { isNetAvailable, readWebCookies } from "@/modules/termix-net";
import { InlineView, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import { sameOrigin } from "@/utils/origin";

// Asks the page's own origin whether Termix answers yet. Once the proxy lets
// us through, a Termix route returns JSON instead of its login page.
const PROBE = `
(function () {
  var done = false;
  function check() {
    if (done) return;
    var paths = ["/sync/v2/info", "/plugins/public-manifest"];
    paths.forEach(function (path) {
      fetch(path, { credentials: "include", headers: { Accept: "application/json" } })
        .then(function (r) {
          var type = r.headers.get("content-type") || "";
          if (!r.ok || type.indexOf("json") < 0) return null;
          return r.json();
        })
        .then(function (data) {
          if (!data || done) return;
          done = true;
          window.ReactNativeWebView.postMessage("PROXY_OK");
        })
        .catch(function () {});
    });
  }
  check();
  setInterval(check, 1500);
})();
true;
`;

/**
 * Sign in to the proxy in front of a server (Cloudflare Access, Authelia,
 * Authentik, ...). The proxy's cookies are then kept for this account and sent
 * with every request, so the app gets through like the browser does.
 */
export function ProxySignIn({
  client,
  open,
  onClose,
  onDone,
}: {
  client: AccountClient | null;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const color = useThemeColor();
  const [saving, setSaving] = useState(false);
  const handled = useRef(false);

  // Each open is a new sign in, also after one that went through.
  useEffect(() => {
    if (open) handled.current = false;
  }, [open]);

  const onMessage = async (message: string, pageUrl?: string) => {
    if (message !== "PROXY_OK" || handled.current || !client) return;
    // The answer must come from the server itself, not a page on the way.
    if (!sameOrigin(pageUrl, client.rootBase())) return;
    handled.current = true;
    setSaving(true);
    try {
      const cookies = await readWebCookies(client.rootBase());
      await client.setProxyCookies(cookies);
      toast.success("Signed in to the proxy");
      onDone?.();
      onClose();
    } catch {
      handled.current = false;
      toast.error("Could not save the proxy sign in");
    } finally {
      setSaving(false);
    }
  };

  return (
    <InlineView
      open={open}
      onClose={() => {
        handled.current = false;
        onClose();
      }}
      title="Sign in to the proxy"
      subtitle={client?.rootBase().replace(/^https?:\/\//, "")}
      scroll={false}
      bare
    >
      {!isNetAvailable() ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-sm text-muted-foreground">
            {
              "This build of the app can't keep a proxy sign in. Use a service token in the proxy headers instead."
            }
          </Text>
        </View>
      ) : client ? (
        <View className="flex-1">
          <WebView
            source={{ uri: client.rootBase() }}
            injectedJavaScript={PROBE}
            onMessage={(event) =>
              void onMessage(event.nativeEvent.data, event.nativeEvent.url)
            }
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            style={{ flex: 1, backgroundColor: color("background") }}
          />
          {saving ? (
            <View className="absolute inset-0 items-center justify-center bg-background/80">
              <ActivityIndicator color={color("accent-brand")} />
            </View>
          ) : null}
        </View>
      ) : null}
    </InlineView>
  );
}
