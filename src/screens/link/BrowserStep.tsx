import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { ArrowLeft, Globe, RefreshCw } from "lucide-react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { Button, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import {
  consumeOidcCallback,
  isOidcCallbackHandled,
  markOidcCallbackHandled,
} from "@/utils/oidc-callback";
import { readWebCookies } from "@/modules/termix-net";
import type { AccountClient } from "@/core/api/AccountClient";
import { consumeFreshWebSession } from "@/core/api/webSession";
import { startFlow, takeFlow } from "@/core/accounts/link/flow";
import {
  APP_CALLBACK_URL,
  browserCanceled,
  browserSignInUrl,
  callbackUrlFor,
  parseCallback,
  redirectStartUrl,
  type SecondFactorStep,
} from "@/core/accounts/link/login";
import type { SignInOption } from "@/core/accounts/link/methods";
import { ProxySignIn } from "@/screens/accounts/ProxySignIn";
import { readHandoff, TOKEN_HANDOFF_SCRIPT } from "./webview-handoff";

/** How this step signs in. */
export type BrowserMode =
  | { kind: "redirect"; option: Extract<SignInOption, { kind: "redirect" }> }
  /** The server's own login page, for passkeys, security keys and more. */
  | { kind: "browser" }
  /** A login proxy sits in front, so the web app is opened in place. */
  | { kind: "proxy" };

/**
 * Signs in through a browser. Redirect methods and the server's own page open
 * in the system browser's sign in sheet, which shares the phone's browser
 * login so SSO doesn't ask again. A login proxy opens the web app in place.
 */
export function BrowserStep({
  client,
  mode,
  onBack,
  onSignedIn,
  onSecondFactor,
}: {
  client: AccountClient;
  mode: BrowserMode;
  onBack: () => void;
  onSignedIn: () => void;
  onSecondFactor: (step: SecondFactorStep) => void;
}) {
  const color = useThemeColor();
  const bg = color("background");
  const accent = color("accent-brand");
  const webViewRef = useRef<WebView>(null);
  const [source, setSource] = useState<{ uri: string } | null>(null);
  const [url, setUrl] = useState("");
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const [webViewKey, setWebViewKey] = useState(() => String(Date.now()));
  const [proxyOpen, setProxyOpen] = useState(false);
  const pendingToken = useRef<string | null>(null);
  // Refs, since the auth session result and the link listener can both fire.
  const started = useRef(false);
  const inited = useRef(false);
  const usedWebView = useRef(false);
  // Set after a sign out, so the browser doesn't quietly sign the old user in.
  const fresh = useRef(false);
  const flowId = useRef<string | null>(null);

  const finish = useCallback(
    async (token: string) => {
      if (started.current) return;
      started.current = true;
      setFinishing(true);
      try {
        await client.setToken(token);
        // A proxy let the web view through with its cookies; keep them.
        if (usedWebView.current) {
          const cookies = await readWebCookies(client.rootBase()).catch(
            () => [],
          );
          if (cookies.length) await client.setProxyCookies(cookies);
        }
        // Proxies can hiccup right after a sign in, so try a few times.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const me = await client.api.auth.getUserInfo();
            if (me?.username) {
              onSignedIn();
              return;
            }
          } catch (e: any) {
            // Signed in, but the proxy only let the browser through. Keep the
            // session and sign in to the proxy here too.
            if (e?.code === "PROXY_LOGIN") {
              pendingToken.current = token;
              started.current = false;
              setProxyOpen(true);
              return;
            }
            if (e?.response?.status === 401 || e?.status === 401) {
              await client.clearToken();
              toast.error(
                "Sign in failed",
                "The server turned the session down. Try again.",
              );
              started.current = false;
              return;
            }
          }
          await new Promise((r) => setTimeout(r, 600));
        }
        await client.clearToken();
        toast.error(
          "Sign in failed",
          "Signed in, but the app can't reach Termix. A proxy may be blocking it.",
        );
        started.current = false;
      } finally {
        setFinishing(false);
      }
    },
    [client, onSignedIn],
  );

  const handleCallback = useCallback(
    async (link: string) => {
      const result = parseCallback(link);
      if (!result) return;
      // The same link can arrive from the session, the listener and the route.
      if (isOidcCallbackHandled(link)) return;
      markOidcCallbackHandled(link);
      // Only the sign in open now, and only once.
      if (!(await takeFlow(result.flow ?? null))) {
        toast.error(
          "Sign in failed",
          "That sign in link is from an older try. Sign in again.",
        );
        return;
      }
      if (result.kind === "error") {
        toast.error("Sign in failed", result.message);
        return;
      }
      if (result.kind === "secondFactor") {
        onSecondFactor(result.step);
        return;
      }
      await finish(result.token);
    },
    [finish, onSecondFactor],
  );

  const openBrowser = useCallback(
    async (target: string) => {
      if (opening || started.current) return;
      setOpening(true);
      try {
        // ASWebAuthenticationSession on iOS and Custom Tabs on Android, both
        // with passkeys. Not ephemeral, so a browser SSO login is reused.
        const result = await WebBrowser.openAuthSessionAsync(
          target,
          callbackUrlFor(flowId.current),
          fresh.current ? { preferEphemeralSession: true } : undefined,
        );
        if (result.type === "success" && result.url) {
          await handleCallback(result.url);
        } else if (browserCanceled(result.type)) {
          // On Android the callback can arrive as a link just after this.
          setTimeout(() => {
            if (started.current) return;
            toast.info(
              "Sign in canceled",
              "Open the browser again when you are ready.",
            );
          }, 800);
        }
      } catch {
        toast.error("Could not open the sign in browser");
      } finally {
        setOpening(false);
      }
    },
    [handleCallback, opening],
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  useEffect(() => {
    const sub = Linking.addEventListener("url", (event) => {
      void handleCallback(event.url);
    });
    return () => sub.remove();
  }, [handleCallback]);

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    const showWebView = (uri: string) => {
      usedWebView.current = true;
      setSource({ uri });
      setUrl(uri);
    };
    void (async () => {
      // A link the phone delivered before this screen was up.
      const parked = consumeOidcCallback();
      if (parked) {
        await handleCallback(parked);
        return;
      }
      await client.clearToken();
      fresh.current = await consumeFreshWebSession(client.accountId);
      if (fresh.current) setIncognito(true);

      // The web app in place and servers before 2.9 send no flow id back.
      const plain =
        mode.kind === "proxy" ||
        (mode.kind === "redirect" && !!mode.option.legacy);
      const flow = await startFlow(plain);
      flowId.current = plain ? null : flow;

      if (mode.kind === "proxy") {
        showWebView(client.serverUrl);
        return;
      }
      let target: string;
      try {
        target =
          mode.kind === "browser"
            ? browserSignInUrl(client, flowId.current)
            : await redirectStartUrl(client, mode.option, flowId.current);
      } catch {
        // The web app's own login still covers it.
        await startFlow(true);
        flowId.current = null;
        showWebView(client.serverUrl);
        return;
      }
      // Always the system browser, also after a sign out: it keeps the SSO
      // login and passkeys work there. iOS starts it clean after a sign out;
      // Android Custom Tabs can't, so the provider decides there.
      setAuthUrl(target);
      setUrl(target);
      await openBrowser(target);
    })();
    // Runs once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNav = (nav: WebViewNavigation) => {
    if (!nav.loading) setUrl(nav.url);
  };

  // A server given the app's callback answers with a termix-mobile:// link;
  // finish here instead of letting Android hand it to the router.
  const onRequest = (request: { url: string }) => {
    if (!request.url.startsWith(APP_CALLBACK_URL)) return true;
    void handleCallback(request.url);
    return false;
  };

  const onMessage = (event: {
    nativeEvent: { data: string; url?: string };
  }) => {
    if (started.current) return;
    const result = readHandoff(
      event.nativeEvent.data,
      event.nativeEvent.url,
      client.serverUrl,
    );
    if (result === "empty") {
      toast.error(
        "Sign in failed",
        "The web page signed in but sent no session. Update the server and try again.",
      );
    } else if (result) {
      void finish(result.token);
    }
  };

  const onError = (event: { nativeEvent: { description?: string } }) => {
    const text = event.nativeEvent.description ?? "";
    if (/SSL|certificate|ERR_CERT/i.test(text)) {
      toast.error(
        "Certificate problem",
        `The phone can't check this server's certificate. Install its root CA on the phone. ${text}`,
      );
    }
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border px-1.5">
        <Pressable
          onPress={onBack}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-11 flex-row items-center gap-1.5 px-2 active:bg-muted"
        >
          <ArrowLeft size={20} color={color("foreground")} />
          <Text weight="medium" className="text-sm text-foreground">
            Sign in
          </Text>
        </Pressable>
        <Text
          className="mx-2 flex-1 text-center text-meta text-muted-foreground"
          numberOfLines={1}
        >
          {url.replace(/^https?:\/\//, "")}
        </Text>
        {source ? (
          <Pressable
            onPress={() => {
              setWebViewKey(String(Date.now()));
              webViewRef.current?.reload();
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Reload"
            className="h-11 w-11 items-center justify-center active:bg-muted"
          >
            <RefreshCw size={17} color={color("foreground")} />
          </Pressable>
        ) : (
          <View className="w-11" />
        )}
      </View>

      {authUrl ? (
        <View className="flex-1 items-center justify-center px-6">
          <Globe size={38} color={accent} />
          <Text weight="medium" className="mt-4 text-lg text-foreground">
            Finish signing in in your browser
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-muted-foreground">
            {mode.kind === "browser"
              ? "Use any sign in your server has, like a passkey or security key. The app picks up once you are in."
              : "The app picks up once your sign in provider is done."}
          </Text>
          <Button
            size="lg"
            className="mt-6 w-full max-w-xs"
            loading={opening || finishing}
            onPress={() => openBrowser(authUrl)}
          >
            {finishing ? "Signing in..." : "Open browser again"}
          </Button>
        </View>
      ) : source ? (
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={source}
          userAgent={
            Platform.OS === "android"
              ? "Termix-Mobile/Android"
              : "Termix-Mobile/iOS"
          }
          style={{ flex: 1, backgroundColor: bg }}
          containerStyle={{ backgroundColor: bg }}
          onNavigationStateChange={onNav}
          onShouldStartLoadWithRequest={onRequest}
          onMessage={onMessage}
          onError={onError}
          injectedJavaScript={TOKEN_HANDOFF_SCRIPT}
          injectedJavaScriptBeforeContentLoaded={`
            document.documentElement.style.backgroundColor = '${bg}';
            true;
          `}
          incognito={incognito}
          cacheEnabled={false}
          cacheMode="LOAD_NO_CACHE"
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          // Proxy cookies must not leak into the app's own requests; the app
          // signs in with the token it gets from here.
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled
          {...(Platform.OS === "android" && {
            mixedContentMode: "compatibility" as const,
            allowFileAccess: false,
          })}
          {...(Platform.OS === "ios" && {
            allowsBackForwardNavigationGestures: false,
          })}
          renderLoading={() => (
            <View
              style={{ backgroundColor: bg }}
              className="absolute inset-0 items-center justify-center"
            >
              <ActivityIndicator size="large" color={accent} />
            </View>
          )}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={accent} />
        </View>
      )}
      <ProxySignIn
        client={client}
        open={proxyOpen}
        onClose={() => setProxyOpen(false)}
        onDone={() => {
          const token = pendingToken.current;
          pendingToken.current = null;
          if (token) void finish(token);
        }}
      />
    </View>
  );
}
