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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Keyboard as KeyboardIcon,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react-native";
import type { SSHHost } from "@/types";
import {
  getGuacamoleTokenFromHost,
  getGuacamoleWebSocketUrl,
} from "@/app/main-axios";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { BottomSheet, SegmentedControl, Button } from "@/app/components/ui";

// Height of the always-visible key strip at the bottom.
// The parent session area already accounts for the tab bar + safe-area insets,
// so we only need our own strip height here.
const KEY_STRIP_HEIGHT = 44;

type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

type MouseMode = "touch" | "trackpad";

interface Modifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
}

interface RemoteDesktopProps {
  host: SSHHost;
  isVisible: boolean;
  title: string;
  onClose?: () => void;
}

export function RemoteDesktop({ host, isVisible, title }: RemoteDesktopProps) {
  const color = useThemeColor();
  const { bottom: safeBottom } = useSafeAreaInsets();

  const themeBg = color("background") ?? "rgb(12,13,11)";
  const themeCard = color("card") ?? "rgb(24,25,23)";
  const themeBorder = color("border") ?? "rgb(50,50,50)";
  const themeFg = color("foreground") ?? "rgb(250,250,250)";
  const themeMuted = color("muted-foreground") ?? "rgb(164,164,164)";
  const themeAccent = color("accent-brand") ?? "#f59145";

  // True available size measured from onLayout — avoids using full window
  // height which includes areas already consumed by the tab bar and insets.
  const [availableSize, setAvailableSize] = useState<{ w: number; h: number } | null>(null);
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
  const initialSizeRef = useRef({ width: 1280, height: 720 });

  const webViewRef = useRef<WebView>(null);
  const inputRef = useRef<TextInput>(null);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);

  const [mouseMode, setMouseMode] = useState<MouseMode>("touch");
  const [modifiers, setModifiers] = useState<Modifiers>({
    ctrl: false,
    alt: false,
    shift: false,
    win: false,
  });
  const [showFunctionKeys, setShowFKeys] = useState(false);
  const [showSettingsSheet, setShowSettings] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Track keyboard visibility — use the raw keyboard height minus the bottom
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
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Connection ────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    try {
      setConnectionState("connecting");
      setErrorMessage(null);
      const { token } = await getGuacamoleTokenFromHost(Number(host.id));
      // Use measured layout size; fall back to ref if layout fired already
      const measured = availableSizeRef.current;
      const remW = measured ? measured.w : 1280;
      const remH = measured ? Math.max(1, measured.h - KEY_STRIP_HEIGHT) : 720;
      initialSizeRef.current = { width: remW, height: remH };
      setWebSocketUrl(getGuacamoleWebSocketUrl(token, remW, remH));
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
      } else if (payload.type === "zoomChange") {
        setZoomLevel(payload.zoom);
      }
    } catch {
      setConnectionState("failed");
      setErrorMessage("Remote session returned an invalid message");
    }
  }, []);

  // ── WebView HTML ──────────────────────────────────────────────────────────

  const htmlContent = useMemo(() => {
    if (!webSocketUrl) return "";

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
    }
    /* The canvas element Guacamole creates sits inside #display.
       We force it to always fill 100% of the viewport via CSS —
       this is the "stretch to fill" approach. Guacamole's own
       display.scale() is disabled; we handle coordinate mapping
       ourselves so clicks land exactly where you touch. */
    #display {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      overflow: hidden;
    }
    /* The actual canvas/div Guacamole appends */
    #display > div {
      position: absolute;
      top: 0; left: 0;
      width: 100% !important;
      height: 100% !important;
      transform-origin: top left;
    }
    #display > div > canvas {
      width: 100% !important;
      height: 100% !important;
    }
  </style>
  <script src="https://unpkg.com/guacamole-common-js@1.5.0/dist/cjs/guacamole-common.min.js"></script>
</head>
<body>
  <div id="display"></div>
  <script>
    (function () {
      const wsUrl = ${JSON.stringify(webSocketUrl)};
      const displayContainer = document.getElementById('display');
      const post = (p) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(p));

      if (!window.Guacamole) { post({ type: 'error', message: 'Guacamole client failed to load' }); return; }

      const tunnel = new Guacamole.WebSocketTunnel(wsUrl);
      const client = new Guacamole.Client(tunnel);
      const display = client.getDisplay();
      const displayElement = display.getElement();
      displayContainer.appendChild(displayElement);

      // Disable Guacamole's own scaling — we stretch via CSS and map coords ourselves.
      display.onresize = () => { display.scale(1); };

      // ── Coordinate mapping ───────────────────────────────────────────────
      // The remote canvas is stretched to fill the viewport via CSS.
      // To convert a touch position (in viewport px) to remote canvas coords:
      //   remoteX = touchX / viewportW * remoteW   (then undo zoom/pan offset)
      //   remoteY = touchY / viewportH * remoteH
      // When zoomed, the viewport shows a sub-region of the canvas.
      // panX/panY are the top-left corner of that sub-region in remote px.

      let remoteW = ${JSON.stringify(initialSizeRef.current.width)};
      let remoteH = ${JSON.stringify(initialSizeRef.current.height)};
      let zoom = 1;    // 1 = fit to screen, >1 = zoomed in
      let panX = 0;    // remote-space offset of viewport top-left
      let panY = 0;

      const vpW = () => window.innerWidth;
      const vpH = () => window.innerHeight;

      // Convert viewport touch coords → remote canvas coords
      const toRemote = (vx, vy) => ({
        x: panX + vx / (vpW() * zoom) * remoteW,
        y: panY + vy / (vpH() * zoom) * remoteH,
      });

      // Apply zoom+pan as CSS transform on the display element.
      // We translate so the zoomed region stays anchored.
      const applyTransform = () => {
        // At zoom=1: show full remote canvas in viewport (scale=1, no offset).
        // At zoom=2: show half the canvas; the half starts at (panX,panY) in remote coords.
        // CSS scale stretches the element, then we translate to show the right region.
        // The element is already 100vw × 100vh at zoom=1 (via CSS).
        // After scale(zoom), it becomes zoom*100vw × zoom*100vh.
        // We shift it left/up so the visible portion starts at panX,panY.
        const txPx = -(panX / remoteW) * vpW() * zoom;
        const tyPx = -(panY / remoteH) * vpH() * zoom;
        displayElement.style.transform = 'scale(' + zoom + ') translate(' + (txPx/zoom) + 'px,' + (tyPx/zoom) + 'px)';
        displayElement.style.transformOrigin = 'top left';
      };

      // Clamp pan so we never show outside the remote canvas
      const clampPan = () => {
        const visW = remoteW / zoom;  // how many remote px are visible horizontally
        const visH = remoteH / zoom;
        panX = Math.max(0, Math.min(remoteW - visW, panX));
        panY = Math.max(0, Math.min(remoteH - visH, panY));
      };

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
            const fixedRX = pinchPanX0 + pinchMidX0 / (vpW() * pinchZoom0) * remoteW;
            const fixedRY = pinchPanY0 + pinchMidY0 / (vpH() * pinchZoom0) * remoteH;
            panX = fixedRX - midX / (vpW() * newZoom) * remoteW;
            panY = fixedRY - midY / (vpH() * newZoom) * remoteH;
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
              panX -= dragDX / (vpW() * zoom) * remoteW;
              panY -= dragDY / (vpH() * zoom) * remoteH;
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
        if (Math.abs(tx - tpX) > 4 || Math.abs(ty - tpY) > 4) tpMoved = true;

        if (currentMode === 'touch') {
          // Single finger always drives the remote mouse (click+drag), even when zoomed.
          // The coordinate mapping (toRemote) already accounts for pan+zoom.
          sendMouseAt(tx, ty, false, false, false, false);
          tpMoved = true;
        } else {
          // Trackpad: relative movement
          const rdx = (tx - tpX) * SENS * (remoteW / vpW()) / zoom;
          const rdy = (ty - tpY) * SENS * (remoteH / vpH()) / zoom;
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
          if (!tpMoved && dur < 250 && e.changedTouches.length === 1 && e.touches.length === 0) {
            const tx = e.changedTouches[0].clientX, ty = e.changedTouches[0].clientY;
            sendMouseAt(tx, ty, true, false, false, false);
            setTimeout(() => sendMouseAt(tx, ty, false, false, false, false), 60);
          }
        } else {
          // Trackpad
          if (e.touches.length === 0) {
            if (!tpMoved && dur < 250 && e.changedTouches.length === 1) {
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

      // ── termixRemote API ─────────────────────────────────────────────────
      window.termixRemote = {
        sendKeysym: (k) => { client.sendKeyEvent(1, k); client.sendKeyEvent(0, k); },
        sendKeysyms: (ks) => {
          ks.forEach((k) => client.sendKeyEvent(1, k));
          ks.slice().reverse().forEach((k) => client.sendKeyEvent(0, k));
        },
        resize: (w, h) => {
          remoteW = Math.max(1, Math.round(w));
          remoteH = Math.max(1, Math.round(h));
          client.sendSize(remoteW, remoteH);
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
        post({ type: 'error', message: err && err.message ? err.message : 'Remote session failed' });
      };

      window.addEventListener('beforeunload', () => client.disconnect());
      client.connect('');
      post({ type: 'state', state: 'connecting' });
    })();
  </script>
</body>
</html>`;
  }, [webSocketUrl]);

  // ── Reconnect ─────────────────────────────────────────────────────────────

  const reconnect = useCallback(() => {
    setWebSocketUrl(null);
    setZoomLevel(1.0);
    setModifiers({ ctrl: false, alt: false, shift: false, win: false });
    setWebViewKey((k) => k + 1);
  }, []);

  // ── JS bridge helpers ─────────────────────────────────────────────────────

  const inject = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`${script}; true;`);
  }, []);

  const sendKeysym = useCallback(
    (k: number) => inject(`window.termixRemote && window.termixRemote.sendKeysym(${k})`),
    [inject],
  );

  const sendKeysyms = useCallback(
    (ks: number[]) => inject(`window.termixRemote && window.termixRemote.sendKeysyms(${JSON.stringify(ks)})`),
    [inject],
  );

  const sendText = useCallback(
    (t: string) => inject(`window.termixRemote && window.termixRemote.sendText(${JSON.stringify(t)})`),
    [inject],
  );

  const sendWithMods = useCallback(
    (k: number) => {
      inject(`window.termixRemote && window.termixRemote.sendWithModifiers(${k}, ${JSON.stringify(modifiers)})`);
      setModifiers({ ctrl: false, alt: false, shift: false, win: false });
    },
    [inject, modifiers],
  );

  const toggleModifier = useCallback(
    (key: keyof Modifiers) => setModifiers((m) => ({ ...m, [key]: !m[key] })),
    [],
  );

  const resetZoom = useCallback(() => {
    inject("window.termixRemote && window.termixRemote.resetZoom()");
    setZoomLevel(1.0);
  }, [inject]);

  const canSendInput = connectionState === "connected";
  const protocol = (host.connectionType || "rdp").toUpperCase();

  // The keyboard height event is from the screen bottom. Our container's bottom
  // already sits SESSION_TAB_BAR_HEIGHT + safeBottom above the screen bottom
  // (applied by Sessions.tsx). The actual overlap on our container is:
  const SESSION_TAB_BAR_HEIGHT = 62; // getTabBarHeight(portrait) + 2
  const kbOverlap = Math.max(0, keyboardHeight - SESSION_TAB_BAR_HEIGHT - safeBottom);

  // Tell remote to render at the true available size when connected or when
  // the container size changes (orientation change) or keyboard opens/closes.
  useEffect(() => {
    if (!canSendInput || !availableSize) return;
    const remW = availableSize.w;
    const remH = Math.max(1, availableSize.h - KEY_STRIP_HEIGHT - kbOverlap);
    inject(
      `window.termixRemote && window.termixRemote.resize(${remW}, ${remH})`,
    );
  }, [canSendInput, availableSize, kbOverlap, inject]);

  // ── Styles ────────────────────────────────────────────────────────────────

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Outer wrapper: absolute-fills the parent session area.
        container: {
          ...StyleSheet.absoluteFillObject,
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
          ...StyleSheet.absoluteFillObject,
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
        // Key strip: sits at the very bottom of the parent session area
        keyStrip: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: KEY_STRIP_HEIGHT,
          backgroundColor: themeBg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: themeBorder,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 4,
        },
        scrollContent: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 4,
        },
        // Key button in the strip
        key: {
          height: 34,
          paddingHorizontal: 9,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: themeBorder,
          backgroundColor: themeCard,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 4,
        },
        keyText: {
          color: themeFg,
          fontSize: 12,
          fontWeight: "600",
        },
        // Modifier pill (active = accent tinted)
        modKey: {
          height: 34,
          paddingHorizontal: 9,
          borderRadius: 6,
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        modKeyText: {
          fontSize: 12,
          fontWeight: "700",
        },
        divider: {
          width: 1,
          height: 22,
          backgroundColor: themeBorder,
          marginHorizontal: 2,
        },
        iconKey: {
          width: 36,
          height: 34,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: themeBorder,
          backgroundColor: themeCard,
          alignItems: "center",
          justifyContent: "center",
        },
        hiddenInput: {
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          color: "transparent",
        },
        // Settings sheet sections
        sheetSection: {
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: themeBorder,
          gap: 8,
        },
        sheetLabel: {
          color: themeMuted,
          fontSize: 10,
          fontWeight: "700",
          textTransform: "uppercase" as const,
          letterSpacing: 1,
        },
        sheetDesc: {
          color: themeMuted,
          fontSize: 11,
          lineHeight: 16,
        },
        zoomRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
        },
        zoomLabel: {
          color: themeMuted,
          fontSize: 12,
          flex: 1,
        },
      }),
    [themeBg, themeCard, themeBorder, themeFg, themeMuted],
  );

  const modKeyStyle = (active: boolean) => ({
    ...styles.modKey,
    borderColor: active ? themeAccent : themeBorder,
    backgroundColor: active ? themeAccent : themeCard,
  });

  const modKeyTextStyle = (active: boolean) => ({
    ...styles.modKeyText,
    color: active ? "#fff" : themeMuted,
  });

  const FKEYS = useMemo(() => Array.from({ length: 12 }, (_, i) => 0xffbe + i), []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View
      ref={containerRef}
      pointerEvents={isVisible ? "auto" : "none"}
      style={[styles.container, { opacity: isVisible ? 1 : 0, zIndex: isVisible ? 1 : -1 }]}
      onLayout={handleContainerLayout}
    >
      {/* WebView */}
      {htmlContent ? (
        <WebView
          key={`rdp-${host.id}-${webViewKey}`}
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={[styles.webView, { bottom: KEY_STRIP_HEIGHT + kbOverlap }]}
          javaScriptEnabled
          domStorageEnabled
          scalesPageToFit={false}
          allowsInlineMediaPlayback
          cacheEnabled={false}
          cacheMode="LOAD_NO_CACHE"
          androidLayerType="hardware"
          onMessage={handleMessage}
          onError={(e) => { setConnectionState("failed"); setErrorMessage(e.nativeEvent.description); }}
          onHttpError={(e) => { setConnectionState("failed"); setErrorMessage(`HTTP ${e.nativeEvent.statusCode}`); }}
          scrollEnabled={false}
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
          <Text style={styles.overlayTitle}>Connecting {protocol}</Text>
          <Text style={styles.overlayText}>{title}</Text>
        </View>
      )}

      {/* Failed / disconnected overlay */}
      {(connectionState === "failed" || connectionState === "disconnected") && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>
            {connectionState === "failed" ? "Connection Failed" : "Disconnected"}
          </Text>
          {errorMessage ? (
            <Text style={styles.overlayText}>{errorMessage}</Text>
          ) : null}
          <Button
            variant="outline"
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
        onChangeText={(text) => { if (text) sendText(text); }}
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

      {/* ── Key strip ── */}
      {canSendInput && (
        <View style={[styles.keyStrip, { bottom: kbOverlap }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Modifier keys */}
            {(["ctrl", "alt", "shift", "win"] as const).map((k) => (
              <TouchableOpacity key={k} style={modKeyStyle(modifiers[k])} onPress={() => toggleModifier(k)}>
                <Text style={modKeyTextStyle(modifiers[k])}>
                  {k === "ctrl" ? "Ctrl" : k === "alt" ? "Alt" : k === "shift" ? "⇧" : "Win"}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.divider} />

            {/* Keyboard toggle */}
            {isKeyboardOpen ? (
              <TouchableOpacity
                style={[styles.key, { borderColor: themeAccent, backgroundColor: themeAccent }]}
                onPress={() => Keyboard.dismiss()}
              >
                <X size={13} color="#fff" />
                <Text style={[styles.keyText, { color: "#fff" }]}>Done</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.iconKey}
                onPress={() => inputRef.current?.focus()}
              >
                <KeyboardIcon size={15} color={themeMuted} />
              </TouchableOpacity>
            )}

            <View style={styles.divider} />

            {/* Common keys */}
            {[
              { label: "Esc", k: 0xff1b },
              { label: "Tab", k: 0xff09 },
            ].map(({ label, k }) => (
              <TouchableOpacity key={label} style={styles.key} onPress={() => sendWithMods(k)}>
                <Text style={styles.keyText}>{label}</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.divider} />

            {/* Arrow keys */}
            <TouchableOpacity style={styles.iconKey} onPress={() => sendWithMods(0xff51)}>
              <ChevronLeft size={14} color={themeFg} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconKey} onPress={() => sendWithMods(0xff52)}>
              <ChevronUp size={14} color={themeFg} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconKey} onPress={() => sendWithMods(0xff54)}>
              <ChevronDown size={14} color={themeFg} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconKey} onPress={() => sendWithMods(0xff53)}>
              <ChevronRight size={14} color={themeFg} />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Nav keys */}
            {[
              { label: "Home", k: 0xff50 },
              { label: "End", k: 0xff57 },
              { label: "PgUp", k: 0xff55 },
              { label: "PgDn", k: 0xff56 },
              { label: "Bksp", k: 0xff08 },
              { label: "Del", k: 0xffff },
              { label: "Enter", k: 0xff0d },
            ].map(({ label, k }) => (
              <TouchableOpacity key={label} style={styles.key} onPress={() => sendWithMods(k)}>
                <Text style={styles.keyText}>{label}</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.divider} />

            {/* System combos */}
            <TouchableOpacity style={styles.key} onPress={() => sendKeysyms([0xffe3, 0xffe9, 0xffff])}>
              <Text style={styles.keyText}>CAD</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.key} onPress={() => sendKeysyms([0xffeb])}>
              <Text style={styles.keyText}>Win</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* F-key toggle */}
            <TouchableOpacity
              style={[styles.key, showFunctionKeys && { borderColor: themeAccent, backgroundColor: themeAccent }]}
              onPress={() => setShowFKeys((v) => !v)}
            >
              <Text style={[styles.keyText, showFunctionKeys && { color: "#fff" }]}>Fn</Text>
            </TouchableOpacity>

            {/* F1–F12 (shown inline when toggled) */}
            {showFunctionKeys && FKEYS.map((ks, i) => (
              <TouchableOpacity key={ks} style={styles.key} onPress={() => sendWithMods(ks)}>
                <Text style={styles.keyText}>F{i + 1}</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.divider} />

            {/* Settings */}
            <TouchableOpacity style={styles.iconKey} onPress={() => setShowSettings(true)}>
              <Settings2 size={15} color={themeMuted} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ── Settings sheet (mouse mode + zoom only — compact) ── */}
      <BottomSheet
        visible={showSettingsSheet}
        onClose={() => setShowSettings(false)}
        title="Remote Settings"
        scroll={false}
      >
        {/* Mouse mode */}
        <View style={styles.sheetSection}>
          <Text style={styles.sheetLabel}>Mouse Mode</Text>
          <SegmentedControl
            options={[
              { id: "touch" as MouseMode, label: "Touch" },
              { id: "trackpad" as MouseMode, label: "Trackpad" },
            ]}
            value={mouseMode}
            onChange={(m) => {
              setMouseMode(m);
              inject(`window.termixRemote && window.termixRemote.setMouseMode('${m}')`);
            }}
          />
          <Text style={styles.sheetDesc}>
            {mouseMode === "touch"
              ? "Tap directly where you want to click."
              : "Drag to move pointer. Single tap = click. Two-finger tap = right-click."}
          </Text>
        </View>

        {/* Zoom */}
        <View style={styles.zoomRow}>
          <Text style={styles.zoomLabel}>
            Zoom: {zoomLevel.toFixed(1)}× — pinch anywhere to zoom
          </Text>
          <Button variant="outline" size="sm" onPress={resetZoom}>
            Reset
          </Button>
        </View>
      </BottomSheet>
    </View>
  );
}
