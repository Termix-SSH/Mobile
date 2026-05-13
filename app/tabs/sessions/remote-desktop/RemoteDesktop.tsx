import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { RotateCcw } from "lucide-react-native";
import type { SSHHost } from "@/types";
import {
  getGuacamoleTokenFromHost,
  getGuacamoleWebSocketUrl,
} from "@/app/main-axios";

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "failed";

interface RemoteDesktopProps {
  host: SSHHost;
  isVisible: boolean;
  title: string;
  onClose?: () => void;
}

export function RemoteDesktop({
  host,
  isVisible,
  title,
}: RemoteDesktopProps) {
  const webViewRef = useRef<WebView>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);

  const connect = useCallback(async () => {
    try {
      setConnectionState("connecting");
      setErrorMessage(null);

      const { token } = await getGuacamoleTokenFromHost(Number(host.id));
      setWebSocketUrl(getGuacamoleWebSocketUrl(token));
    } catch (error) {
      setConnectionState("failed");
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to start remote session",
      );
    }
  }, [host.id]);

  useEffect(() => {
    connect();
  }, [connect, webViewKey]);

  const handleMessage = useCallback((event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);

      if (payload.type === "state") {
        if (payload.state === "connected") {
          setConnectionState("connected");
          setErrorMessage(null);
        } else if (payload.state === "disconnected") {
          setConnectionState("disconnected");
        }
      } else if (payload.type === "error") {
        setConnectionState("failed");
        setErrorMessage(payload.message || "Remote session failed");
      }
    } catch {
      setConnectionState("failed");
      setErrorMessage("Remote session returned an invalid message");
    }
  }, []);

  const htmlContent = useMemo(() => {
    if (!webSocketUrl) return "";

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body, #display {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #050608;
      touch-action: none;
    }
    #display {
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
    }
    #display > div {
      transform-origin: 0 0;
    }
  </style>
  <script src="https://unpkg.com/guacamole-common-js@1.5.0/dist/cjs/guacamole-common.min.js"></script>
</head>
<body>
  <div id="display"></div>
  <script>
    (function () {
      const wsUrl = ${JSON.stringify(webSocketUrl)};
      const displayContainer = document.getElementById("display");
      const post = (payload) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));

      if (!window.Guacamole) {
        post({ type: "error", message: "Guacamole client failed to load" });
        return;
      }

      const tunnel = new Guacamole.WebSocketTunnel(wsUrl);
      const client = new Guacamole.Client(tunnel);
      const display = client.getDisplay();
      const displayElement = display.getElement();

      displayContainer.appendChild(displayElement);

      const resizeDisplay = () => {
        const width = display.getWidth();
        const height = display.getHeight();
        if (!width || !height) return;

        const scale = Math.min(
          displayContainer.clientWidth / width,
          displayContainer.clientHeight / height
        );
        display.scale(Math.max(scale, 0.1));
      };

      display.onresize = resizeDisplay;
      window.addEventListener("resize", resizeDisplay);

      const mouse = Guacamole.Mouse.Touchscreen
        ? new Guacamole.Mouse.Touchscreen(displayElement)
        : new Guacamole.Mouse(displayElement);
      mouse.onmousedown =
        mouse.onmouseup =
        mouse.onmousemove =
          (state) => client.sendMouseState(state);

      client.onstatechange = (state) => {
        if (state === Guacamole.Client.State.CONNECTED) {
          post({ type: "state", state: "connected" });
        } else if (
          state === Guacamole.Client.State.DISCONNECTED ||
          state === Guacamole.Client.State.DISCONNECTING
        ) {
          post({ type: "state", state: "disconnected" });
        }
      };

      client.onerror = (error) => {
        post({ type: "error", message: error && error.message ? error.message : "Remote session failed" });
      };

      window.addEventListener("beforeunload", () => client.disconnect());
      client.connect("");
      post({ type: "state", state: "connecting" });
    })();
  </script>
</body>
</html>`;
  }, [webSocketUrl]);

  const reconnect = useCallback(() => {
    setWebSocketUrl(null);
    setWebViewKey((current) => current + 1);
  }, []);

  const protocol = (host.connectionType || "rdp").toUpperCase();

  return (
    <View
      pointerEvents={isVisible ? "auto" : "none"}
      style={[
        styles.container,
        {
          opacity: isVisible ? 1 : 0,
          zIndex: isVisible ? 1 : -1,
        },
      ]}
    >
      {htmlContent ? (
        <WebView
          key={`remote-desktop-${host.id}-${webViewKey}`}
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scalesPageToFit={false}
          allowsInlineMediaPlayback={true}
          cacheEnabled={false}
          cacheMode="LOAD_NO_CACHE"
          androidLayerType="hardware"
          onMessage={handleMessage}
          onError={(event) => {
            setConnectionState("failed");
            setErrorMessage(event.nativeEvent.description);
          }}
          onHttpError={(event) => {
            setConnectionState("failed");
            setErrorMessage(`WebView HTTP error: ${event.nativeEvent.statusCode}`);
          }}
          scrollEnabled={false}
          overScrollMode="never"
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          setSupportMultipleWindows={false}
        />
      ) : null}

      {(connectionState === "connecting" || connectionState === "idle") && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#22C55E" />
          <Text style={styles.overlayTitle}>Connecting {protocol}</Text>
          <Text style={styles.overlayText}>{title}</Text>
        </View>
      )}

      {(connectionState === "failed" || connectionState === "disconnected") && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>
            {connectionState === "failed" ? "Connection Failed" : "Disconnected"}
          </Text>
          {errorMessage ? <Text style={styles.overlayText}>{errorMessage}</Text> : null}
          <TouchableOpacity style={styles.retryButton} onPress={reconnect}>
            <RotateCcw size={16} color="#ffffff" />
            <Text style={styles.retryText}>Reconnect</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#050608",
  },
  webView: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#050608",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#050608",
  },
  overlayTitle: {
    marginTop: 12,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  overlayText: {
    marginTop: 8,
    color: "#9CA3AF",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 18,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#16A34A",
    backgroundColor: "#22C55E",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  retryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
