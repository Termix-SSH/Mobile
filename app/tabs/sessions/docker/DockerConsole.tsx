import { useCallback, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Pressable } from "react-native";
import { WebView } from "react-native-webview";
import { RotateCcw } from "lucide-react-native";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import {
  getCookie,
  getDockerConsoleWebSocketUrl,
} from "@/app/main-axios";
import type { SSHHost, DockerContainer } from "@/types";

/**
 * Interactive `docker exec` console. Renders a minimal xterm.js inside a WebView
 * (same approach as the SSH Terminal) and bridges it to the backend docker
 * console WebSocket (port 30009). Connect → input/resize/output round-trip.
 *
 * Kept deliberately small: this is a shell into a container, not the full
 * terminal experience (no command history / snippets), so it skips the heavier
 * Terminal machinery.
 */
export function DockerConsole({
  host,
  container,
  isVisible,
}: {
  host: SSHHost;
  container: DockerContainer;
  isVisible: boolean;
}) {
  const color = useThemeColor();
  const webViewRef = useRef<WebView>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "error" | "closed"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [webViewKey, setWebViewKey] = useState(0);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setErrorMessage("");
    const token = await getCookie("jwt");
    if (!token) {
      setStatus("error");
      setErrorMessage("Not authenticated");
      return;
    }
    try {
      wsRef.current?.close();
    } catch {}

    const ws = new WebSocket(getDockerConsoleWebSocketUrl(token));
    wsRef.current = ws;

    ws.onopen = () => {
      send({
        type: "connect",
        data: {
          hostConfig: { id: host.id, enableDocker: true },
          containerId: container.id,
          cols: 80,
          rows: 24,
        },
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "output") {
          // Feed raw output into xterm in the WebView.
          webViewRef.current?.injectJavaScript(
            `window.__write(${JSON.stringify(msg.data)}); true;`,
          );
        } else if (msg.type === "connected") {
          setStatus("connected");
        } else if (msg.type === "error") {
          setStatus("error");
          setErrorMessage(msg.message || "Console error");
        } else if (msg.type === "disconnected") {
          setStatus("closed");
        }
      } catch {}
    };

    ws.onerror = () => {
      setStatus("error");
      setErrorMessage("Connection failed");
    };

    ws.onclose = () => {
      setStatus((s) => (s === "error" ? s : "closed"));
    };
  }, [host.id, container.id, send]);

  useEffect(() => {
    connect();
    return () => {
      try {
        send({ type: "disconnect" });
        wsRef.current?.close();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webViewKey]);

  const onWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === "input") {
          send({ type: "input", data: msg.data });
        } else if (msg.type === "resize") {
          send({ type: "resize", data: { cols: msg.cols, rows: msg.rows } });
        }
      } catch {}
    },
    [send],
  );

  const reconnect = () => setWebViewKey((k) => k + 1);

  if (!isVisible) return null;

  return (
    <View className="flex-1 bg-black">
      <WebView
        key={webViewKey}
        ref={webViewRef}
        source={{ html: CONSOLE_HTML }}
        onMessage={onWebViewMessage}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        style={{ flex: 1, backgroundColor: "#000" }}
      />
      {status !== "connected" ? (
        <View className="absolute inset-0 items-center justify-center bg-black/80 gap-3">
          {status === "connecting" ? (
            <>
              <ActivityIndicator size="large" color={color("accent-brand")} />
              <Text className="text-sm text-muted-foreground">
                Attaching to {container.name}…
              </Text>
            </>
          ) : (
            <>
              <Text className="text-sm text-destructive text-center px-8">
                {errorMessage || "Console disconnected"}
              </Text>
              <Pressable
                onPress={reconnect}
                className="flex-row items-center gap-1.5 px-3 py-2 border border-border active:bg-muted/40"
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

const CONSOLE_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>
<script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
<link rel="stylesheet" href="https://unpkg.com/xterm@5.3.0/css/xterm.css" />
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
