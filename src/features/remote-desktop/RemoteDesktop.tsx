import {
  afterAuthFailure,
  rdpLogin,
  type RdpCredentials,
} from "@/features/remote-desktop/rdp-login";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  PixelRatio,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  inlineJson,
  LOCAL_PAGE_ORIGINS,
  stayOnLocalPage,
} from "@/utils/webview";
import {
  resolveRemoteDesktopSize,
  type RemoteDesktopSize,
} from "./remoteDesktopSize";
import { VIEWPORT_SCRIPT } from "./viewport";
import { loadGuacamoleAssets } from "./loadGuacamoleAssets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTabBarHeight } from "@/utils/responsive";
import { useWindowInfo } from "@/utils/window-class";
import { RotateCcw } from "lucide-react-native";
import type { SSHHost } from "@/types";
import { useThemeColor } from "@/contexts/ThemeContext";
import { Button } from "@/ui";
import { useSessionClient } from "@/core/accounts/session";
import type { SessionTabStatus } from "@/core/features/types";
import { sessionLifecycle } from "@/core/sessions/lifecycle";
import { shouldAutoReconnect, tunnelWatchScript } from "./resume";
import {
  needsSocketBridge,
  SOCKET_SHIM_SCRIPT,
  SocketBridge,
} from "./tunnel-bridge";
import {
  KEY_STRIP_HEIGHT,
  RdpSignInSheet,
  RemoteKeyStrip,
  RemoteSettingsSheet,
  type MouseMode,
} from "./RemoteChrome";

type ConnectionState =
  | "awaiting-credentials"
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

export type RemoteDesktopProtocol = "rdp" | "vnc" | "telnet";

interface RemoteDesktopProps {
  host: SSHHost;
  isVisible: boolean;
  title: string;
  protocol?: RemoteDesktopProtocol;
  onClose?: () => void;
  onStatus?: (status: SessionTabStatus) => void;
}

export function RemoteDesktop({
  host,
  isVisible,
  title,
  protocol,
  onStatus,
}: RemoteDesktopProps) {
  const client = useSessionClient();
  const color = useThemeColor();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const win = useWindowInfo();

  const themeBg = color("background") ?? "rgb(12,13,11)";
  const themeFg = color("foreground") ?? "rgb(250,250,250)";
  const themeMuted = color("muted-foreground") ?? "rgb(164,164,164)";
  const themeAccent = color("accent-brand");

  // True available size measured from onLayout - avoids using full window
  // height which includes areas already consumed by the tab bar and insets.
  const [availableSize, setAvailableSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const availableSizeRef = useRef<{ w: number; h: number } | null>(null);
  const containerRef = useRef<View>(null);

  const handleContainerLayout = useCallback((e: any) => {
    const { width: lw, height: lh } = e.nativeEvent.layout;
    const w = Math.round(lw);
    const h = Math.round(lh);
    availableSizeRef.current = { w, h };
    setAvailableSize({ w, h });
  }, []);

  // Stores the resolved initial size once connect() runs
  const initialSizeRef = useRef<RemoteDesktopSize>({
    width: 1280,
    height: 720,
  });

  const webViewRef = useRef<WebView>(null);
  const inputRef = useRef<TextInput>(null);

  // Behind a client certificate or proxy the socket goes through the app.
  const bridged = needsSocketBridge(client);
  const bridgeRef = useRef<SocketBridge | null>(null);
  if (bridged && !bridgeRef.current) {
    bridgeRef.current = new SocketBridge(client, (event) =>
      webViewRef.current?.injectJavaScript(
        `window.__termixWs && window.__termixWs(${JSON.stringify(event)}); true;`,
      ),
    );
  }
  useEffect(() => () => bridgeRef.current?.closeAll(), []);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);

  const [mouseMode, setMouseMode] = useState<MouseMode>("touch");
  const [showSettingsSheet, setShowSettings] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Track keyboard visibility - use the raw keyboard height minus the bottom
  // margin that Sessions.tsx already applies (tab bar + safe area insets).
  // We get the container's page position at show-time to compute exact overlap.
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setIsKeyboardOpen(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setIsKeyboardOpen(false);
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // ── Connection ────────────────────────────────────────────────────────────

  const resolvedProtocol = protocol ?? host.connectionType ?? "rdp";
  const login = rdpLogin(host, resolvedProtocol);
  const cancelPrompt = () => setConnectionState("disconnected");

  const connect = useCallback(
    async (credentials?: RdpCredentials) => {
      setWebSocketUrl(null);
      setErrorMessage(null);
      if (login.prompt && !credentials) {
        setConnectionState("awaiting-credentials");
        return;
      }
      try {
        setConnectionState("connecting");
        setErrorMessage(null);
        const { token } =
          await client.api.remoteDesktop.getGuacamoleTokenFromHost(
            Number(host.id),
            protocol,
            credentials,
          );
        // Use measured layout size; fall back to ref if layout fired already
        const measured = availableSizeRef.current;
        const size = resolveRemoteDesktopSize(
          host.guacamoleConfig,
          measured?.w ?? 1280,
          measured ? Math.max(1, measured.h - KEY_STRIP_HEIGHT) : 720,
          resolvedProtocol === "rdp" ? PixelRatio.get() : 1,
        );
        initialSizeRef.current = size;
        setWebSocketUrl(
          client.remoteDesktopWebSocketUrl(
            token,
            size.width,
            size.height,
            size.dpi,
          ),
        );
      } catch (error) {
        setConnectionState("failed");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to start remote session",
        );
      }
    },
    [
      host.id,
      host.guacamoleConfig,
      resolvedProtocol,
      protocol,
      login.prompt,
      login.domain,
    ],
  );

  useEffect(() => {
    connect();
  }, [connect, webViewKey]);

  // Coming back to the app: a socket that died while away gets a new session
  // instead of a frozen screen (issue #104).
  const [autoReconnecting, setAutoReconnecting] = useState(false);
  const autoAttempts = useRef(0);
  const resumedAt = useRef(0);
  const connectionStateRef = useRef(connectionState);
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  const reconnectRef = useRef<() => void>(() => {});
  // This socket got as far as connected, so losing it is a drop.
  const wasLive = useRef(false);
  const handleLost = useCallback((reason: "stale" | "lost") => {
    if (!wasLive.current) return;
    wasLive.current = false;
    const ok = shouldAutoReconnect({
      reason,
      attempts: autoAttempts.current,
      away: !sessionLifecycle.isActive,
      sinceResumeMs: Date.now() - resumedAt.current,
    });
    if (!ok) {
      setAutoReconnecting(false);
      if (reason === "lost") setConnectionState("disconnected");
      return;
    }
    autoAttempts.current += 1;
    setAutoReconnecting(true);
    reconnectRef.current();
  }, []);

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data);
        if (bridgeRef.current?.handle(payload)) return;
        if (payload.type === "state") {
          if (payload.state === "connected") {
            wasLive.current = true;
            autoAttempts.current = 0;
            setAutoReconnecting(false);
            setConnectionState("connected");
            setErrorMessage(null);
          } else if (payload.state === "disconnected") {
            setConnectionState((s) =>
              s === "connecting" ? s : "disconnected",
            );
          }
        } else if (payload.type === "lost" || payload.type === "stale") {
          handleLost(payload.type);
        } else if (payload.type === "error") {
          const next = afterAuthFailure(resolvedProtocol, login.prompt, {
            code: payload.code,
            message: payload.message,
          });
          if (next === "prompt") {
            wasLive.current = false;
            setWebSocketUrl(null);
            setErrorMessage("That login was refused. Try again.");
            setConnectionState("awaiting-credentials");
            return;
          }
          setConnectionState("failed");
          setErrorMessage(
            next === "saved-login"
              ? "The remote refused the saved login. Check the RDP login on this host."
              : payload.message || "Remote session failed",
          );
        } else if (payload.type === "zoomChange") {
          setZoomLevel(payload.zoom);
        }
      } catch {
        setConnectionState("failed");
        setErrorMessage("Remote session returned an invalid message");
      }
    },
    [handleLost, resolvedProtocol, login.prompt],
  );

  // ── WebView HTML ──────────────────────────────────────────────────────────

  const [guacamoleJs, setGuacamoleJs] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGuacamoleAssets()
      .then((js) => {
        if (!cancelled) setGuacamoleJs(js);
      })
      .catch(() => {
        if (cancelled) return;
        setConnectionState("failed");
        setErrorMessage("Failed to load the remote desktop client");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const htmlContent = useMemo(() => {
    if (!webSocketUrl || !guacamoleJs) return "";

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      margin: 0; padding: 0;
      overflow: hidden;
      background: #000;
      touch-action: none;
      /* A held trackpad click must not select or drag the page on iPadOS. */
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      -webkit-user-drag: none;
    }
    #display {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      overflow: hidden;
    }
    #display > div {
      position: absolute;
      top: 0; left: 0;
      transform-origin: top left;
    }
  </style>
  <script>${guacamoleJs}</script>
  ${bridged ? `<script>${SOCKET_SHIM_SCRIPT}</script>` : ""}
</head>
<body>
  <div id="display"></div>
  <script>
    (function () {
      const wsUrl = ${inlineJson(webSocketUrl)};
      const displayContainer = document.getElementById('display');
      const post = (p) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(p));

      if (!window.Guacamole) { post({ type: 'error', message: 'Guacamole client failed to load' }); return; }

      const tunnel = new Guacamole.WebSocketTunnel(wsUrl);
      const client = new Guacamole.Client(tunnel);
${tunnelWatchScript()}
      const display = client.getDisplay();
      const displayElement = display.getElement();
      displayContainer.appendChild(displayElement);

      // The server owns the framebuffer size, especially for fixed-size VNC.
      let remoteW = ${JSON.stringify(initialSizeRef.current.width)};
      let remoteH = ${JSON.stringify(initialSizeRef.current.height)};
      let remoteDpi = ${JSON.stringify(initialSizeRef.current.dpi ?? 0)};
      let zoom = 1; // Relative to fit-to-screen, not framebuffer pixels.
      let panX = 0;
      let panY = 0;
${VIEWPORT_SCRIPT}
      const applyTransform = () => {
        const scale = fitScale() * zoom;
        display.scale(scale);
        displayElement.style.transform = 'translate(' + (-panX * scale) + 'px,' + (-panY * scale) + 'px)';
      };
      display.onresize = (width, height) => {
        if (width <= 0 || height <= 0) return;
        remoteW = width;
        remoteH = height;
        clampPan();
        applyTransform();
      };
      window.addEventListener('resize', () => {
        clampPan();
        applyTransform();
      });

      // ── Touch mode ───────────────────────────────────────────────────────
      let currentMode = 'touch';

      const sendMouseAt = (vx, vy, left, right, scrollUp, scrollDown) => {
        const r = toRemote(vx, vy);
        const rx = Math.round(Math.max(0, Math.min(remoteW, r.x)));
        const ry = Math.round(Math.max(0, Math.min(remoteH, r.y)));
        client.sendMouseState(new Guacamole.Mouse.State(rx, ry, !!left, false, !!right, !!scrollUp, !!scrollDown));
      };

      // ── Trackpad mode ────────────────────────────────────────────────────
      let mouseRX = remoteW / 2, mouseRY = remoteH / 2;
      const SENS = 1.8;

      const sendMouseCursor = (left, right) => {
        client.sendMouseState(new Guacamole.Mouse.State(
          Math.round(Math.max(0, Math.min(remoteW, mouseRX))),
          Math.round(Math.max(0, Math.min(remoteH, mouseRY))),
          !!left, false, !!right, false, false
        ));
      };

      // ── Pinch / pan state ────────────────────────────────────────────────
      let pinchDist0 = null, pinchZoom0 = 1, pinchPanX0 = 0, pinchPanY0 = 0;
      let pinchMidX0 = 0, pinchMidY0 = 0;
      let isPinching = false;

      // ── Single touch state ───────────────────────────────────────────────
      let tpX = 0, tpY = 0, tpTime = 0, tpMoved = false;
      let tfTimer = null;
      const TAP_MS = 350;
      const TAP_MOVE_PX = 8;

      const dist2 = (e) => {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        return Math.sqrt(dx * dx + dy * dy);
      };

      // Two-finger drag state (for scroll and viewport pan)
      let twoFingerLastX = 0, twoFingerLastY = 0;
      let isScrolling = false; // two-finger drag without pinch distance change
      let scrollAccum = 0;     // accumulated px before firing a scroll tick
      const SCROLL_PX = 40;    // px of two-finger drag per one scroll tick

      displayContainer.addEventListener('touchstart', (e) => {
        e.preventDefault();

        if (e.touches.length === 2) {
          isPinching = false;
          isScrolling = false;
          scrollAccum = 0;
          pinchDist0 = dist2(e);
          pinchZoom0 = zoom;
          pinchPanX0 = panX;
          pinchPanY0 = panY;
          pinchMidX0 = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          pinchMidY0 = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          twoFingerLastX = pinchMidX0;
          twoFingerLastY = pinchMidY0;
          if (currentMode === 'trackpad') {
            tfTimer = setTimeout(() => { tfTimer = null; }, 300);
          }
          return;
        }

        if (e.touches.length === 1) {
          tpX = e.touches[0].clientX;
          tpY = e.touches[0].clientY;
          tpTime = Date.now();
          tpMoved = false;
        }
      }, { passive: false });

      displayContainer.addEventListener('touchmove', (e) => {
        e.preventDefault();

        if (e.touches.length === 2 && pinchDist0 !== null) {
          const d = dist2(e);
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const distDelta = Math.abs(d - pinchDist0);

          if (distDelta > 8 || isPinching) {
            // ── Pinch to zoom ─────────────────────────────────────────────
            isPinching = true;
            isScrolling = false;
            if (tfTimer) { clearTimeout(tfTimer); tfTimer = null; }

            const newZoom = Math.max(1, Math.min(8, pinchZoom0 * (d / pinchDist0)));
            const fixedRX = pinchPanX0 + pinchMidX0 / (fitScale() * pinchZoom0);
            const fixedRY = pinchPanY0 + pinchMidY0 / (fitScale() * pinchZoom0);
            panX = fixedRX - midX / (fitScale() * newZoom);
            panY = fixedRY - midY / (fitScale() * newZoom);
            zoom = newZoom;
            clampPan();
            applyTransform();
            post({ type: 'zoomChange', zoom: Math.round(zoom * 10) / 10 });
          } else {
            // ── Two-finger drag: scroll (touch mode) or pan (zoomed) ──────
            isScrolling = true;
            if (tfTimer) { clearTimeout(tfTimer); tfTimer = null; }
            const dragDX = midX - twoFingerLastX;
            const dragDY = midY - twoFingerLastY;
            twoFingerLastX = midX;
            twoFingerLastY = midY;

            if (zoom > 1 && currentMode === 'touch') {
              // Pan viewport when zoomed
              panX -= dragDX / (fitScale() * zoom);
              panY -= dragDY / (fitScale() * zoom);
              clampPan();
              applyTransform();
            } else {
              // Scroll wheel: accumulate drag and fire one tick per SCROLL_PX
              scrollAccum += dragDY;
              if (Math.abs(scrollAccum) >= SCROLL_PX) {
                const scrollUp = scrollAccum > 0;
                scrollAccum = 0;
                const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
                sendMouseAt(tx, ty, false, false, scrollUp, !scrollUp);
                setTimeout(() => sendMouseAt(tx, ty, false, false, false, false), 30);
              }
            }
          }
          return;
        }

        if (e.touches.length !== 1) return;
        const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
        const moved =
          Math.abs(tx - tpX) > TAP_MOVE_PX ||
          Math.abs(ty - tpY) > TAP_MOVE_PX;

        if (currentMode === 'touch') {
          // Single finger always drives the remote mouse (click+drag), even when zoomed.
          // The coordinate mapping (toRemote) already accounts for pan+zoom.
          sendMouseAt(tx, ty, false, false, false, false);
          if (moved) tpMoved = true;
        } else {
          // Trackpad: relative movement
          const rdx = (tx - tpX) * SENS * 1 / (fitScale() * zoom);
          const rdy = (ty - tpY) * SENS * 1 / (fitScale() * zoom);
          tpX = tx; tpY = ty;
          if (Math.abs(rdx) > 0.5 || Math.abs(rdy) > 0.5) tpMoved = true;
          mouseRX = Math.max(0, Math.min(remoteW, mouseRX + rdx));
          mouseRY = Math.max(0, Math.min(remoteH, mouseRY + rdy));
          sendMouseCursor(false, false);
        }
      }, { passive: false });

      displayContainer.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (e.touches.length < 2) { pinchDist0 = null; isPinching = false; isScrolling = false; }

        const dur = Date.now() - tpTime;

        if (currentMode === 'touch') {
          // Tap (no movement, quick) = click
          if (!tpMoved && dur < TAP_MS && e.changedTouches.length === 1 && e.touches.length === 0) {
            const tx = e.changedTouches[0].clientX, ty = e.changedTouches[0].clientY;
            sendMouseAt(tx, ty, true, false, false, false);
            setTimeout(() => sendMouseAt(tx, ty, false, false, false, false), 60);
          }
        } else {
          // Trackpad
          if (e.touches.length === 0) {
            if (!tpMoved && dur < TAP_MS && e.changedTouches.length === 1) {
              sendMouseCursor(true, false);
              setTimeout(() => sendMouseCursor(false, false), 60);
            }
            if (tfTimer !== null && !isPinching) {
              clearTimeout(tfTimer); tfTimer = null;
              sendMouseCursor(false, true);
              setTimeout(() => sendMouseCursor(false, false), 60);
            }
          }
        }
      }, { passive: false });

      // ── Hardware pointer (iPad trackpad, Bluetooth mouse) ────────────────
      // A trackpad or mouse reaches the web view as mouse events, not touch
      // events, so none of the handlers above see it. Guacamole.Mouse maps
      // mousemove/mousedown/mouseup and the wheel to mouse states, and drops
      // the synthetic mouse events Safari fires after a touch, so the finger
      // gestures above and this layer do not double-fire.
      const hardwareMouse = new Guacamole.Mouse(displayContainer);
      hardwareMouse.onEach(['mousedown', 'mousemove', 'mouseup'], (e) => {
        // Only legacy handlers cancel the DOM event, so do it here, or a held
        // click starts a text selection or drag in the web view.
        e.preventDefault();
        const st = e.state;
        sendMouseAt(st.x, st.y, st.left, st.right, st.up, st.down);
        // Keep the virtual trackpad cursor where the real pointer left it so
        // a finger tap afterwards lands at the same spot.
        if (currentMode === 'trackpad') {
          const r = toRemote(st.x, st.y);
          mouseRX = Math.max(0, Math.min(remoteW, r.x));
          mouseRY = Math.max(0, Math.min(remoteH, r.y));
        }
      });

      // ── termixRemote API ─────────────────────────────────────────────────
      window.termixRemote = {
        sendKeysym: (k) => { client.sendKeyEvent(1, k); client.sendKeyEvent(0, k); },
        sendKeysyms: (ks) => {
          ks.forEach((k) => client.sendKeyEvent(1, k));
          ks.slice().reverse().forEach((k) => client.sendKeyEvent(0, k));
        },
        resize: (w, h, dpi) => {
          if (dpi) remoteDpi = dpi;
          const width = Math.max(1, Math.round(w));
          const height = Math.max(1, Math.round(h));
          // sendSize drops the dpi, so the session would fall back to 100% scale.
          if (remoteDpi) tunnel.sendMessage('size', width, height, remoteDpi);
          else client.sendSize(width, height);
        },
        sendText: (text) => {
          Array.from(text).forEach((ch) => {
            const cp = ch.codePointAt(0);
            if (!cp) return;
            const ks = cp <= 0xff ? cp : (0x01000000 | cp);
            client.sendKeyEvent(1, ks); client.sendKeyEvent(0, ks);
          });
        },
        setMouseMode: (mode) => {
          currentMode = mode;
          if (mode === 'trackpad') {
            mouseRX = remoteW / 2;
            mouseRY = remoteH / 2;
          }
        },
        resetZoom: () => {
          zoom = 1; panX = 0; panY = 0; isPinching = false;
          applyTransform();
          post({ type: 'zoomChange', zoom: 1 });
        },
        sendWithModifiers: (keysym, mods) => {
          const down = [];
          if (mods.ctrl)  down.push(0xffe3);
          if (mods.alt)   down.push(0xffe9);
          if (mods.shift) down.push(0xffe1);
          if (mods.win)   down.push(0xffeb);
          down.push(keysym);
          down.forEach((k) => client.sendKeyEvent(1, k));
          down.slice().reverse().forEach((k) => client.sendKeyEvent(0, k));
        },
      };

      client.onstatechange = (state) => {
        if (state === Guacamole.Client.State.CONNECTED) {
          post({ type: 'state', state: 'connected' });
        } else if (state === Guacamole.Client.State.DISCONNECTED || state === Guacamole.Client.State.DISCONNECTING) {
          post({ type: 'state', state: 'disconnected' });
        }
      };
      client.onerror = (err) => {
        post({
          type: 'error',
          code: err && typeof err.code === 'number' ? err.code : undefined,
          message: err && err.message ? err.message : 'Remote session failed',
        });
      };

      window.addEventListener('beforeunload', () => client.disconnect());
      client.connect('');
      post({ type: 'state', state: 'connecting' });
    })();
  </script>
</body>
</html>`;
  }, [webSocketUrl, guacamoleJs, bridged]);

  // ── Reconnect ─────────────────────────────────────────────────────────────

  const reconnect = useCallback(() => {
    bridgeRef.current?.closeAll();
    setWebSocketUrl(null);
    setZoomLevel(1.0);
    setWebViewKey((k) => k + 1);
  }, []);
  useEffect(() => {
    reconnectRef.current = reconnect;
  }, [reconnect]);

  useEffect(() => {
    const check = () => {
      if (connectionStateRef.current !== "connected") return;
      webViewRef.current?.injectJavaScript(
        "window.termixAlive && window.termixAlive(); true;",
      );
    };
    return sessionLifecycle.register({
      notifyForegrounded: () => {
        resumedAt.current = Date.now();
        check();
      },
      notifyNetworkChanged: (info) => {
        if (info.connected && info.changed) {
          resumedAt.current = Date.now();
          check();
        }
      },
    });
  }, []);

  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);
  useEffect(() => {
    const report = onStatusRef.current;
    if (!report) return;
    if (autoReconnecting && connectionState !== "connected") {
      report({ state: "reconnecting", reason: "The remote desktop dropped" });
      return;
    }
    switch (connectionState) {
      case "connected":
        report({ state: "connected" });
        break;
      case "failed":
        report({ state: "failed", reason: errorMessage ?? undefined });
        break;
      case "disconnected":
        report({ state: "closed" });
        break;
      default:
        report({ state: "connecting" });
    }
  }, [connectionState, autoReconnecting, errorMessage]);

  // ── JS bridge helpers ─────────────────────────────────────────────────────

  const inject = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`${script}; true;`);
  }, []);

  const sendKeysym = useCallback(
    (k: number) =>
      inject(`window.termixRemote && window.termixRemote.sendKeysym(${k})`),
    [inject],
  );

  const sendKeysyms = useCallback(
    (ks: number[]) =>
      inject(
        `window.termixRemote && window.termixRemote.sendKeysyms(${JSON.stringify(ks)})`,
      ),
    [inject],
  );

  const sendText = useCallback(
    (t: string) =>
      inject(
        `window.termixRemote && window.termixRemote.sendText(${JSON.stringify(t)})`,
      ),
    [inject],
  );

  const resetZoom = useCallback(() => {
    inject("window.termixRemote && window.termixRemote.resetZoom()");
    setZoomLevel(1.0);
  }, [inject]);

  const canSendInput = connectionState === "connected";
  const protocolLabel = (
    protocol ??
    host.connectionType ??
    "rdp"
  ).toUpperCase();

  // The keyboard height event is from the screen bottom. Our container's bottom
  // already sits SESSION_TAB_BAR_HEIGHT + safeBottom above the screen bottom
  // (applied by Sessions.tsx). The actual overlap on our container is:
  const SESSION_TAB_BAR_HEIGHT =
    getTabBarHeight(win.isLandscape, win.isShort) + 2;
  const kbOverlap = Math.max(
    0,
    keyboardHeight - SESSION_TAB_BAR_HEIGHT - safeBottom,
  );

  // Match the remote to the space we have when connected or rotated. The
  // keyboard only shrinks the view, which refits, so the desktop keeps its size.
  useEffect(() => {
    if (!canSendInput || !availableSize) return;
    const size = resolveRemoteDesktopSize(
      host.guacamoleConfig,
      availableSize.w,
      Math.max(1, availableSize.h - KEY_STRIP_HEIGHT),
      resolvedProtocol === "rdp" ? PixelRatio.get() : 1,
    );
    inject(
      `window.termixRemote && window.termixRemote.resize(${size.width}, ${size.height}, ${size.dpi ?? 0})`,
    );
  }, [
    canSendInput,
    availableSize,
    inject,
    host.guacamoleConfig,
    resolvedProtocol,
  ]);

  // ── Styles ────────────────────────────────────────────────────────────────

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Outer wrapper: absolute-fills the parent session area.
        container: {
          ...StyleSheet.absoluteFill,
          backgroundColor: "#000",
        },
        // WebView fills everything except the key strip at the bottom.
        webView: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: KEY_STRIP_HEIGHT,
          backgroundColor: "#000",
        },
        // Connecting/error overlay: fills the full area (strip not visible yet).
        overlay: {
          ...StyleSheet.absoluteFill,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          backgroundColor: themeBg,
        },
        overlayTitle: {
          marginTop: 12,
          color: themeFg,
          fontSize: 16,
          fontWeight: "600",
          textAlign: "center",
        },
        overlayText: {
          marginTop: 8,
          color: themeMuted,
          fontSize: 13,
          lineHeight: 18,
          textAlign: "center",
        },
        hiddenInput: {
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          color: "transparent",
        },
      }),
    [themeBg, themeFg, themeMuted],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View
      collapsable={false}
      ref={containerRef}
      pointerEvents={isVisible ? "auto" : "none"}
      style={[
        styles.container,
        // No zIndex change: Fabric would re-insert this view for it.
        { opacity: isVisible ? 1 : 0 },
      ]}
      onLayout={handleContainerLayout}
    >
      <RdpSignInSheet
        visible={isVisible && connectionState === "awaiting-credentials"}
        description={
          errorMessage
            ? `${errorMessage} They will not be saved.`
            : `Enter credentials for ${title}. They will not be saved.`
        }
        initialUsername=""
        initialDomain={login.domain}
        onCancel={cancelPrompt}
        onConnect={(credentials) => void connect(credentials)}
      />

      {/* WebView */}
      {htmlContent ? (
        <WebView
          key={`rdp-${host.id}-${webViewKey}`}
          ref={webViewRef}
          source={{ html: htmlContent }}
          originWhitelist={LOCAL_PAGE_ORIGINS}
          onShouldStartLoadWithRequest={stayOnLocalPage}
          style={[styles.webView, { bottom: KEY_STRIP_HEIGHT + kbOverlap }]}
          javaScriptEnabled
          domStorageEnabled
          scalesPageToFit={false}
          allowsInlineMediaPlayback
          cacheEnabled={false}
          cacheMode="LOAD_NO_CACHE"
          androidLayerType="hardware"
          onMessage={handleMessage}
          onError={(e) => {
            setConnectionState("failed");
            setErrorMessage(e.nativeEvent.description);
          }}
          onHttpError={(e) => {
            setConnectionState("failed");
            setErrorMessage(`HTTP ${e.nativeEvent.statusCode}`);
          }}
          // Leave the scroll view on: iPadOS only turns trackpad scrolling into
          // wheel events while it is. The page can't scroll, and bounces is off.
          overScrollMode="never"
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          setSupportMultipleWindows={false}
        />
      ) : null}

      {/* Connecting overlay */}
      {(connectionState === "connecting" || connectionState === "idle") && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={themeAccent} />
          <Text style={styles.overlayTitle}>Connecting {protocolLabel}</Text>
          <Text style={styles.overlayText}>{title}</Text>
        </View>
      )}

      {/* Failed / disconnected overlay */}
      {(connectionState === "failed" || connectionState === "disconnected") && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>
            {connectionState === "failed"
              ? "Connection Failed"
              : "Disconnected"}
          </Text>
          {errorMessage ? (
            <Text style={styles.overlayText}>{errorMessage}</Text>
          ) : null}
          <Button
            variant="muted"
            onPress={reconnect}
            className="mt-4"
            icon={<RotateCcw size={14} color={themeFg} />}
          >
            Reconnect
          </Button>
        </View>
      )}

      {/* Hidden text input for keyboard */}
      <TextInput
        ref={inputRef}
        value=""
        onChangeText={(text) => {
          if (text) sendText(text);
        }}
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === "Backspace") sendKeysym(0xff08);
        }}
        onSubmitEditing={() => {
          sendKeysym(0xff0d);
          // Re-focus so the keyboard stays open after Enter
          setTimeout(() => inputRef.current?.focus(), 10);
        }}
        blurOnSubmit={false}
        returnKeyType="send"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={styles.hiddenInput}
      />

      {canSendInput && (
        <RemoteKeyStrip
          bottom={kbOverlap}
          keyboardOpen={isKeyboardOpen}
          onKeyboard={() => inputRef.current?.focus()}
          send={sendKeysyms}
          onSettings={() => setShowSettings(true)}
        />
      )}

      <RemoteSettingsSheet
        visible={showSettingsSheet}
        onClose={() => setShowSettings(false)}
        mouseMode={mouseMode}
        onMouseMode={(m) => {
          setMouseMode(m);
          inject(
            `window.termixRemote && window.termixRemote.setMouseMode('${m}')`,
          );
        }}
        zoom={zoomLevel}
        onResetZoom={resetZoom}
      />
    </View>
  );
}
