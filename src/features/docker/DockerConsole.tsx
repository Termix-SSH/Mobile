import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadXtermAssets } from "@/features/terminal/loadXtermAssets";
import {
  View,
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { WebView } from "react-native-webview";
import { LOCAL_PAGE_ORIGINS, stayOnLocalPage } from "@/utils/webview";
import { RotateCcw } from "lucide-react-native";
import { Text } from "@/ui";
import { useTheme, useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalCustomization } from "@/contexts/TerminalCustomizationContext";
import { MOBILE_DEFAULT_TERMINAL_CONFIG } from "@/constants/terminal-config";
import { XTERM_FALLBACK } from "@/features/terminal/fallback";
import { resolveTerminalSettings } from "@/features/terminal/settings";
import {
  TerminalView,
  type TerminalViewApi,
} from "@/features/terminal/TerminalView";
import type { DockerContainer } from "@/types";
import { useClient } from "@/core/accounts";
import { useSessionAccountId } from "@/core/accounts/session";
import type { DockerConsoleTarget } from "./backend/types";
import {
  openLocalConsole,
  openRelayConsole,
  type ConsoleLink,
} from "./consoleLink";

/**
 * Interactive shell in a container on the native terminal view (xterm in a
 * WebView under the fallback flag). It runs over the phone's own SSH, or
 * through the server's docker console socket.
 *
 * Kept small: a shell into a container, not the full terminal experience.
 */
export function DockerConsole({
  target,
  container,
  isVisible,
}: {
  target: DockerConsoleTarget;
  container: DockerContainer;
  isVisible: boolean;
}) {
  const color = useThemeColor();
  const webViewRef = useRef<WebView>(null);
  const terminalRef = useRef<TerminalViewApi>(null);
  const sizeRef = useRef({ cols: 80, rows: 24 });
  const { resolvedTheme } = useTheme();
  const { fontScale } = useWindowDimensions();
  const { config } = useTerminalCustomization();
  const settings = useMemo(
    () =>
      resolveTerminalSettings(
        { ...MOBILE_DEFAULT_TERMINAL_CONFIG, ...config },
        undefined,
        resolvedTheme,
        fontScale,
      ),
    [config, resolvedTheme, fontScale],
  );
  const client = useClient(useSessionAccountId());
  const linkRef = useRef<ConsoleLink | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "error" | "closed"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [webViewKey, setWebViewKey] = useState(0);
  const [consoleHtml, setConsoleHtml] = useState<string | null>(null);

  const write = useCallback((text: string) => {
    if (XTERM_FALLBACK) {
      webViewRef.current?.injectJavaScript(
        `window.__write(${JSON.stringify(text)}); true;`,
      );
    } else {
      terminalRef.current?.write(text);
    }
  }, []);

  useEffect(() => {
    if (!XTERM_FALLBACK) return;
    let cancelled = false;
    loadXtermAssets(false)
      .then((assets) => {
        if (!cancelled) setConsoleHtml(buildConsoleHtml(assets));
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Failed to load the console");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setStatus("connecting");
    setErrorMessage("");
    const events = {
      onOutput: write,
      onConnected: () => setStatus("connected"),
      onError: (message: string) => {
        setStatus("error");
        setErrorMessage(message);
      },
      onClosed: () => setStatus((s) => (s === "error" ? s : "closed")),
    };
    const link =
      target.kind === "local"
        ? openLocalConsole(target, container.id, sizeRef.current, events)
        : client
          ? openRelayConsole(
              client,
              target.host,
              container.id,
              () => sizeRef.current,
              events,
            )
          : null;
    if (!link) {
      events.onError("This session has no server");
      return;
    }
    linkRef.current = link;
    return () => {
      link.close();
      if (linkRef.current === link) linkRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webViewKey, container.id]);

  const onResize = useCallback((cols: number, rows: number) => {
    sizeRef.current = { cols, rows };
    linkRef.current?.resize(cols, rows);
  }, []);

  const onWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === "input") linkRef.current?.input(msg.data);
        else if (msg.type === "resize") onResize(msg.cols, msg.rows);
      } catch {}
    },
    [onResize],
  );

  const reconnect = () => setWebViewKey((k) => k + 1);

  const { ref: boxRef, measure, overlap } = useKeyboardOverlap();

  if (!isVisible || (XTERM_FALLBACK && !consoleHtml)) return null;

  return (
    <View
      ref={boxRef}
      onLayout={measure}
      className="flex-1"
      style={{
        paddingBottom: overlap,
        // Match the terminal so the strip behind the keyboard blends in.
        backgroundColor: XTERM_FALLBACK ? "#000" : settings.colors.background,
      }}
    >
      {XTERM_FALLBACK ? (
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={{ html: consoleHtml ?? "" }}
          onMessage={onWebViewMessage}
          originWhitelist={LOCAL_PAGE_ORIGINS}
          onShouldStartLoadWithRequest={stayOnLocalPage}
          javaScriptEnabled
          domStorageEnabled
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          style={{ flex: 1, backgroundColor: "#000" }}
        />
      ) : (
        <TerminalView
          key={webViewKey}
          ref={terminalRef}
          settings={settings}
          onInput={(data) => linkRef.current?.input(data)}
          onResize={onResize}
        />
      )}
      {status !== "connected" ? (
        <View className="absolute inset-0 items-center justify-center gap-3 bg-black/80">
          {status === "connecting" ? (
            <>
              <ActivityIndicator size="large" color={color("accent-brand")} />
              <Text className="text-sm text-muted-foreground">
                Attaching to {container.name}...
              </Text>
            </>
          ) : (
            <>
              <Text className="px-8 text-center text-sm text-destructive-text">
                {errorMessage || "Console disconnected"}
              </Text>
              <Pressable
                onPress={reconnect}
                className="flex-row items-center gap-1.5 border border-border px-3 py-2 active:bg-muted/40"
              >
                <RotateCcw size={14} color={color("foreground")} />
                <Text className="text-xs text-foreground">Reconnect</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** How much of this view the keyboard covers, so the terminal can shrink above it. */
function useKeyboardOverlap() {
  const ref = useRef<View>(null);
  const bottomRef = useRef(0);
  const topRef = useRef<number | null>(null);
  const [overlap, setOverlap] = useState(0);

  const update = useCallback(() => {
    const top = topRef.current;
    setOverlap(top === null ? 0 : Math.max(0, bottomRef.current - top));
  }, []);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _w, h) => {
      bottomRef.current = y + h;
      update();
    });
  }, [update]);

  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(
      ios ? "keyboardWillChangeFrame" : "keyboardDidShow",
      (e) => {
        topRef.current =
          e.endCoordinates.height > 0 ? e.endCoordinates.screenY : null;
        // Android may resize the window for the keyboard, so measure again.
        measure();
      },
    );
    const hide = Keyboard.addListener(
      ios ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        topRef.current = null;
        update();
      },
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [measure, update]);

  return { ref, measure, overlap };
}

const buildConsoleHtml = (assets: {
  xtermJs: string;
  xtermCss: string;
  fitAddonJs: string;
}) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<script>${assets.xtermJs}</script>
<script>${assets.fitAddonJs}</script>
<style>${assets.xtermCss}</style>
<style>
  html, body, #term { margin:0; padding:0; height:100%; width:100%; background:#000; overflow:hidden; }
  .xterm { padding:6px; }
</style>
</head>
<body>
<div id="term"></div>
<script>
  var term = new Terminal({
    cursorBlink: true,
    fontFamily: 'monospace',
    fontSize: 13,
    theme: { background: '#000000', foreground: '#e4e4e7' },
    scrollback: 2000,
  });
  var fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById('term'));
  function doFit() {
    try {
      fit.fit();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type:'resize', cols: term.cols, rows: term.rows }));
      }
    } catch (e) {}
  }
  setTimeout(doFit, 50);
  window.addEventListener('resize', doFit);
  window.__write = function(d){ term.write(d); };
  term.onData(function(d){
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'input', data: d }));
    }
  });
  term.focus();
</script>
</body>
</html>`;
