import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { Keyboard, RotateCcw } from "lucide-react-native";
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
  const { width, height } = useWindowDimensions();
  const initialSizeRef = useRef({
    width: Math.round(width),
    height: Math.round(height),
  });
  const webViewRef = useRef<WebView>(null);
  const inputRef = useRef<TextInput>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const [inputValue, setInputValue] = useState("");

  const connect = useCallback(async () => {
    try {
      setConnectionState("connecting");
      setErrorMessage(null);

      const { token } = await getGuacamoleTokenFromHost(Number(host.id));
      const initialSize = initialSizeRef.current;
      setWebSocketUrl(
        getGuacamoleWebSocketUrl(token, initialSize.width, initialSize.height),
      );
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

      let currentScale = 1;
      const resizeDisplay = () => {
        const width = display.getWidth();
        const height = display.getHeight();
        if (!width || !height) return;

        currentScale = Math.min(
          displayContainer.clientWidth / width,
          displayContainer.clientHeight / height
        );
        display.scale(Math.max(currentScale, 0.1));
      };

      display.onresize = resizeDisplay;
      window.addEventListener("resize", resizeDisplay);

      const mouse = Guacamole.Mouse.Touchscreen
        ? new Guacamole.Mouse.Touchscreen(displayElement)
        : new Guacamole.Mouse(displayElement);
      const sendMouseState = (state) => {
        const scale = Math.max(currentScale, 0.1);
        state.x = Math.round(state.x / scale);
        state.y = Math.round(state.y / scale);
        client.sendMouseState(state);
      };
      mouse.onmousedown =
        mouse.onmouseup =
        mouse.onmousemove =
          sendMouseState;

      window.termixRemote = {
        sendKeysym: (keysym) => {
          client.sendKeyEvent(1, keysym);
          client.sendKeyEvent(0, keysym);
        },
        sendKeysyms: (keysyms) => {
          keysyms.forEach((keysym) => client.sendKeyEvent(1, keysym));
          keysyms.slice().reverse().forEach((keysym) => client.sendKeyEvent(0, keysym));
        },
        sendText: (text) => {
          Array.from(text).forEach((char) => {
            const codepoint = char.codePointAt(0);
            if (!codepoint) return;
            const keysym = codepoint <= 0xff ? codepoint : (0x01000000 | codepoint);
            client.sendKeyEvent(1, keysym);
            client.sendKeyEvent(0, keysym);
          });
        },
      };

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

  const injectRemoteCommand = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`${script}; true;`);
  }, []);

  const sendKeysym = useCallback(
    (keysym: number) => {
      injectRemoteCommand(
        `window.termixRemote && window.termixRemote.sendKeysym(${keysym})`,
      );
    },
    [injectRemoteCommand],
  );

  const sendKeysyms = useCallback(
    (keysyms: number[]) => {
      injectRemoteCommand(
        `window.termixRemote && window.termixRemote.sendKeysyms(${JSON.stringify(keysyms)})`,
      );
    },
    [injectRemoteCommand],
  );

  const sendText = useCallback(
    (text: string) => {
      injectRemoteCommand(
        `window.termixRemote && window.termixRemote.sendText(${JSON.stringify(text)})`,
      );
    },
    [injectRemoteCommand],
  );

  const handleInputChange = useCallback(
    (text: string) => {
      if (text) {
        sendText(text);
      }
      setInputValue("");
    },
    [sendText],
  );

  const protocol = (host.connectionType || "rdp").toUpperCase();
  const canSendInput = connectionState === "connected";

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

      {canSendInput && (
        <View style={styles.toolbar}>
          <TextInput
            ref={inputRef}
            value={inputValue}
            onChangeText={handleInputChange}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === "Backspace") {
                sendKeysym(0xff08);
              } else if (nativeEvent.key === "Enter") {
                sendKeysym(0xff0d);
              }
            }}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            style={styles.hiddenInput}
          />
          <RemoteKeyButton
            label="Keys"
            icon={<Keyboard size={16} color="#ffffff" />}
            onPress={() => inputRef.current?.focus()}
          />
          <RemoteKeyButton label="Esc" onPress={() => sendKeysym(0xff1b)} />
          <RemoteKeyButton label="Tab" onPress={() => sendKeysym(0xff09)} />
          <RemoteKeyButton label="Enter" onPress={() => sendKeysym(0xff0d)} />
          <RemoteKeyButton label="Bksp" onPress={() => sendKeysym(0xff08)} />
          <RemoteKeyButton
            label="CAD"
            onPress={() => sendKeysyms([0xffe3, 0xffe9, 0xffff])}
          />
        </View>
      )}
    </View>
  );
}

function RemoteKeyButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.keyButton} onPress={onPress}>
      {icon}
      <Text style={styles.keyButtonText}>{label}</Text>
    </TouchableOpacity>
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
  toolbar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#111827",
    borderTopWidth: 1,
    borderTopColor: "#303032",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    color: "transparent",
  },
  keyButton: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#303032",
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  keyButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
});
