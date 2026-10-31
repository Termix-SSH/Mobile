import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import { Asset } from "expo-asset";
import { useNetworkState } from "expo-network";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { CloudOff, Download, TriangleAlert } from "lucide-react-native";
import { THEME_VARS } from "@/constants/theme";
import { useTheme, useUiColors } from "@/contexts/ThemeContext";
import type { AccountClient } from "@/core/api/AccountClient";
import { fitMessage } from "@/core/plugins/compat";
import { FrameBridge } from "@/core/plugins/frame-bridge";
import { loadFrameBundle, type FrameBundle } from "@/core/plugins/frame-bundle";
import { buildFramePage, frameThemeCss } from "@/core/plugins/frame-page";
import {
  PAGE_RECEIVER,
  parsePageMessage,
  type AppMessage,
  type FrameTheme,
  type FrameViewTarget,
  type ShellCall,
} from "@/core/plugins/frame-protocol";
import type { FramePlugin } from "@/core/plugins/webview";
import { systemLogger } from "@/core/log/logger";
import { Button, EmptyState, Text, useConfirm } from "@/ui";
import { readLocalText } from "@/utils/localFile";
import { PluginIcon } from "./PluginIcon";

let hostScript: Promise<string> | null = null;

function loadHostScript() {
  if (!hostScript) {
    hostScript = (async () => {
      const [asset] = await Asset.loadAsync([
        require("../../../assets/plugin-host/host.js.html"),
      ]);
      return readLocalText(asset.localUri ?? asset.uri);
    })();
    hostScript.catch(() => {
      hostScript = null;
    });
  }
  return hostScript;
}

export interface PluginWebViewHandle {
  /** Closes a dialog or steps back inside the plugin. False when there was nothing to undo. */
  goBack: () => Promise<boolean>;
  reload: () => void;
}

type State =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "offline" }
  | { kind: "error"; title: string; message: string };

/** The origin and path prefix of the server, like https://x.io and /termix. */
function serverParts(client: AccountClient) {
  const url = new URL(client.rootBase());
  return { origin: url.origin, basePath: url.pathname.replace(/\/+$/, "") };
}

export const PluginWebView = forwardRef<
  PluginWebViewHandle,
  {
    client: AccountClient;
    plugin: FramePlugin;
    view: FrameViewTarget;
    onShell: (call: ShellCall, args: unknown[]) => void;
  }
>(({ client, plugin, view, onShell }, ref) => {
  const colors = useUiColors();
  const { resolvedTheme, isDark, accent } = useTheme();
  const confirm = useConfirm();
  const network = useNetworkState();
  const web = useRef<WebView>(null);
  const bridge = useRef<FrameBridge | null>(null);
  const backWaiters = useRef<((handled: boolean) => void)[]>([]);
  const [script, setScript] = useState<string | null>(null);
  const [bundle, setBundle] = useState<FrameBundle | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const offline = network.isConnected === false;
  const { origin, basePath } = useMemo(() => serverParts(client), [client]);

  const theme: FrameTheme = useMemo(
    () => ({ id: resolvedTheme, mode: isDark ? "dark" : "light" }),
    [resolvedTheme, isDark],
  );
  const themeCss = useMemo(
    () => frameThemeCss(theme, THEME_VARS[resolvedTheme], accent),
    [theme, resolvedTheme, accent],
  );

  const send = useCallback((message: AppMessage) => {
    web.current?.injectJavaScript(
      `window.${PAGE_RECEIVER}&&window.${PAGE_RECEIVER}(${JSON.stringify(message)});true;`,
    );
  }, []);

  const misfit = fitMessage(plugin.fit, plugin.name);

  // Code and strings, through the account's client.
  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    setBundle(null);
    // A plugin made for another plugin API is never loaded.
    if (misfit) return;
    if (offline) {
      setState({ kind: "offline" });
      return;
    }
    Promise.all([loadHostScript(), loadFrameBundle(client, plugin)])
      .then(([host, loaded]) => {
        if (!alive) return;
        setScript(host);
        setBundle(loaded.bundle);
      })
      .catch((error) => {
        if (!alive) return;
        systemLogger.warn(`Plugin ${plugin.id} did not load`, {
          operation: "plugin_frame",
          error: String(error),
        });
        setState({
          kind: "error",
          title: `Can't load ${plugin.name}`,
          message:
            "The server did not send the plugin. Check that it is on and try again.",
        });
      });
    return () => {
      alive = false;
    };
    // The view is set once; later changes go to the page as messages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, plugin, attempt, offline]);

  // The HTML is built once per load so theme and view changes don't reload it.
  const html = useMemo(() => {
    if (!script || !bundle) return null;
    return buildFramePage({
      script,
      origin,
      boot: {
        summary: {
          id: plugin.id,
          name: plugin.name,
          version: "",
          enabled: true,
          state: "active",
          frontend: true,
          css: !!bundle.css,
          icon: plugin.icon,
          assetVersion: plugin.frame.assetVersion,
          contributes: plugin.frame.contributes,
        },
        code: bundle.code,
        css: bundle.css,
        locales: bundle.locales,
        view,
        theme,
        themeCss,
        basePath,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, bundle]);

  useEffect(() => {
    if (state.kind === "ready") send({ t: "theme", theme, css: themeCss });
  }, [theme, themeCss, state.kind, send]);

  useEffect(() => {
    if (state.kind === "ready") send({ t: "view", view });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.view, view.hostId]);

  const openLink = useCallback(
    async (url: string) => {
      if (!/^https?:/i.test(url)) return;
      const ok = await confirm({
        title: "Open this link?",
        description: url,
        confirmLabel: "Open",
        destructive: false,
      });
      if (ok) void Linking.openURL(url);
    },
    [confirm],
  );

  // The bridge lives as long as the page; callbacks that change go through refs.
  const shellRef = useRef(onShell);
  const linkRef = useRef(openLink);
  useEffect(() => {
    shellRef.current = onShell;
    linkRef.current = openLink;
  }, [onShell, openLink]);

  useEffect(() => {
    if (!html) return;
    const next = new FrameBridge({
      client,
      pluginId: plugin.id,
      send,
      onShell: (call, args) => shellRef.current(call, args),
      onLink: (url) => void linkRef.current(url),
      onLoaded: () => setState({ kind: "ready" }),
      onFailed: (reason, message) => {
        systemLogger.warn(`Plugin ${plugin.id} failed: ${message}`, {
          operation: "plugin_frame",
        });
        setState(
          reason === "link"
            ? {
                kind: "error",
                title: "Needs a newer version of the app",
                message: `${plugin.name} uses parts of Termix this app does not have yet.`,
              }
            : {
                kind: "error",
                title: `${plugin.name} did not start`,
                message:
                  reason === "view"
                    ? "This screen is not in the plugin version on the server."
                    : "The plugin hit an error while starting.",
              },
        );
      },
      onBackResult: (handled) => backWaiters.current.shift()?.(handled),
      log: (level, message) =>
        systemLogger[
          level === "error" ? "error" : level === "warn" ? "warn" : "info"
        ](`[${plugin.id}] ${message}`, { operation: "plugin_frame" }),
    });
    bridge.current = next;
    return () => {
      next.dispose();
      if (bridge.current === next) bridge.current = null;
    };
  }, [html, client, plugin, send]);

  useImperativeHandle(ref, () => ({
    goBack: () =>
      new Promise<boolean>((resolve) => {
        if (state.kind !== "ready") {
          resolve(false);
          return;
        }
        let done = false;
        const finish = (handled: boolean) => {
          if (done) return;
          done = true;
          resolve(handled);
        };
        backWaiters.current.push(finish);
        setTimeout(() => finish(false), 400);
        send({ t: "back" });
      }),
    reload: () => {
      if (state.kind === "ready") send({ t: "reload" });
      else setAttempt((n) => n + 1);
    },
  }));

  const onMessage = (event: WebViewMessageEvent) => {
    // Messages only count from the page the app loaded.
    if (!event.nativeEvent.url?.startsWith(origin)) return;
    const message = parsePageMessage(event.nativeEvent.data);
    if (message) bridge.current?.handle(message);
  };

  const onShouldStart = (request: ShouldStartLoadRequest) => {
    const url = request.url;
    if (url === "about:blank" || url === `${origin}/` || url === origin) {
      return true;
    }
    if (url.startsWith("blob:") || url.startsWith("data:")) return true;
    // Anything else would replace the plugin page.
    if (request.navigationType === "click") void openLink(url);
    return false;
  };

  if (misfit) {
    return (
      <EmptyState
        className="flex-1"
        icon={Download}
        title={misfit.title}
        hint={misfit.hint}
      />
    );
  }

  if (state.kind === "offline") {
    return (
      <EmptyState
        className="flex-1"
        icon={CloudOff}
        title="You're offline"
        hint={`${plugin.name} runs on your server, so it needs a connection. It opens again when you're back online.`}
        action={
          <Button size="sm" onPress={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        }
      />
    );
  }

  if (state.kind === "error") {
    return (
      <EmptyState
        className="flex-1"
        icon={TriangleAlert}
        title={state.title}
        hint={state.message}
        action={
          <Button size="sm" onPress={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      {html ? (
        <WebView
          key={attempt}
          ref={web}
          source={{ html, baseUrl: `${origin}/` }}
          originWhitelist={[
            origin,
            `${origin}/*`,
            "about:*",
            "blob:*",
            "data:*",
          ]}
          onShouldStartLoadWithRequest={onShouldStart}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          incognito
          cacheEnabled={false}
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          allowsLinkPreview={false}
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          mediaPlaybackRequiresUserAction
          geolocationEnabled={false}
          mixedContentMode="never"
          webviewDebuggingEnabled={__DEV__}
          onContentProcessDidTerminate={() => setAttempt((n) => n + 1)}
          onRenderProcessGone={() => setAttempt((n) => n + 1)}
          style={{ flex: 1, backgroundColor: colors.background }}
        />
      ) : null}
      {state.kind === "loading" ? (
        <View className="absolute inset-0 items-center justify-center gap-3 bg-background">
          <PluginIcon name={plugin.icon} size={28} color={colors.textMuted} />
          <Text className="text-sm text-foreground">{plugin.name}</Text>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : null}
    </View>
  );
});
PluginWebView.displayName = "PluginWebView";
