// VNC and RDP the phone opens itself: the engine draws into the native display
// view, touches and keys go straight back. No server and no web view.
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
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { RotateCcw } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSessionRepositories } from "@/core/data/hooks";
import type { SessionTabStatus } from "@/core/features/types";
import { sessionLifecycle } from "@/core/sessions/lifecycle";
import { fromError, type LocalDisplay, type Transport } from "@/core/transport";
import { TermixDisplayView } from "@/modules/termix-display";
import {
  rdpCertProblem,
  SshError,
  type DisplayProtocol,
} from "@/modules/termix-ssh";
import type { SSHHost } from "@/types";
import { Button, useConfirm } from "@/ui";
import { toTerminalHostConfig } from "@/utils/hosts";
import type { RdpCredentials } from "../rdp-login";
import {
  KEY_STRIP_HEIGHT,
  RdpSignInSheet,
  RemoteKeyStrip,
  RemoteSettingsSheet,
  StripDivider,
  StripKey,
  useRemoteColors,
  type MouseMode,
} from "../RemoteChrome";
import { shouldAutoReconnect } from "../resume";
import { clampPan, fitScale, type Viewport } from "../viewport";
import {
  DisplayGestures,
  LEFT,
  MIDDLE,
  RIGHT,
  type GestureAction,
  type Point,
} from "./gestures";
import { keysymFor } from "./keys";
import {
  certPrompt,
  displayCredentialId,
  displayLogin,
  displayTarget,
  RDP_CERT_PREF,
  type DisplayLogin,
} from "./target";

// Matches the server view: the session area sits above the tab bar.
const SESSION_TAB_BAR_HEIGHT = 62;
const RESIZE_DEBOUNCE_MS = 400;

type Phase =
  | "connecting"
  | "awaiting-credentials"
  | "connected"
  | "failed"
  | "disconnected";

function points(e: GestureResponderEvent): Point[] {
  return e.nativeEvent.touches.map((t) => ({ x: t.locationX, y: t.locationY }));
}

export function NativeRemoteDesktop({
  host,
  protocol,
  transport,
  isVisible,
  title,
  onStatus,
  onUseServer,
}: {
  host: SSHHost;
  protocol: DisplayProtocol;
  /** The phone's transport; it opens the session through jump hosts and proxies. */
  transport: Transport;
  isVisible: boolean;
  title: string;
  onStatus?: (status: SessionTabStatus) => void;
  /** Set when the server could connect this host instead. */
  onUseServer?: () => void;
}) {
  const repos = useSessionRepositories();
  const confirm = useConfirm();
  const c = useRemoteColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const label = protocol.toUpperCase();

  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [canUseServer, setCanUseServer] = useState(false);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [zoomPan, setZoomPan] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [mouseMode, setMouseMode] = useState<MouseMode>("touch");
  const [held, setHeld] = useState(0);
  const [remoteClip, setRemoteClip] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [frameId, setFrameId] = useState<string | null>(null);

  const session = useRef<LocalDisplay | null>(null);
  const gestures = useRef<DisplayGestures | null>(null);
  const inputRef = useRef<TextInput>(null);
  const viewRef = useRef<{ focus(): void } | null>(null);
  const containerRef = useRef(container);
  const typed = useRef<RdpCredentials | null>(null);
  const run = useRef(0);
  const attempts = useRef(0);
  const resumedAt = useRef(0);
  const live = useRef(false);
  const lastSize = useRef<string>("");
  const reconnectRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    containerRef.current = container;
  }, [container]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardOpen(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const kbOverlap = Math.max(
    0,
    keyboardHeight - SESSION_TAB_BAR_HEIGHT - safeBottom,
  );

  const view = useMemo<Viewport | null>(
    () =>
      area.w && frame.w
        ? clampPan({
            viewW: area.w,
            viewH: area.h,
            remoteW: frame.w,
            remoteH: frame.h,
            ...zoomPan,
          })
        : null,
    [area, frame, zoomPan],
  );

  useEffect(() => {
    if (!view) return;
    if (!gestures.current) {
      gestures.current = new DisplayGestures(view, mouseMode);
      gestures.current.held = held;
    } else gestures.current.setView(view);
  }, [view, mouseMode, held]);

  const closeSession = () => {
    session.current?.close();
    session.current = null;
    live.current = false;
    setFrameId(null);
  };

  const connect = useCallback(
    async (credentials?: RdpCredentials) => {
      const id = ++run.current;
      const current = () => id === run.current;
      closeSession();
      setError(null);
      setCanUseServer(false);
      if (credentials) typed.current = credentials;
      setPhase("connecting");
      let login: DisplayLogin | RdpCredentials;
      let serverCert: string | null = null;
      try {
        if (protocol === "rdp") {
          serverCert = await repos.hostPrefs.get(host, RDP_CERT_PREF);
        }
        const credId = displayCredentialId(host, protocol);
        const credential = credId ? await repos.credentials.get(credId) : null;
        const saved = displayLogin(host, protocol, credential);
        if (!current()) return;
        if (saved.prompt && !typed.current) {
          setPhase("awaiting-credentials");
          return;
        }
        login = typed.current ?? saved;
      } catch (err) {
        if (!current()) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("failed");
        return;
      }
      const { w, h } = containerRef.current;
      const target = displayTarget(
        host,
        protocol,
        login,
        w || 390,
        Math.max(1, (h || 760) - KEY_STRIP_HEIGHT),
        PixelRatio.get(),
      );
      lastSize.current = `${target.width}x${target.height}`;
      try {
        const opened = await transport.openDisplay!(
          toTerminalHostConfig(host),
          { ...target, serverCert },
          {
            onResize: (fw, fh) => {
              if (current()) setFrame({ w: fw, h: fh });
            },
            onClipboard: (text) => {
              if (current()) setRemoteClip(text);
            },
            onClosed: (reason) => {
              if (!current()) return;
              session.current = null;
              setFrameId(null);
              const wasLive = live.current;
              live.current = false;
              if (reason == null) return;
              const again =
                wasLive &&
                shouldAutoReconnect({
                  reason: "lost",
                  attempts: attempts.current,
                  away: !sessionLifecycle.isActive,
                  sinceResumeMs: Date.now() - resumedAt.current,
                });
              if (again) {
                attempts.current += 1;
                setReconnecting(true);
                void reconnectRef.current();
                return;
              }
              setReconnecting(false);
              setError(reason);
              setPhase("disconnected");
            },
          },
        );
        if (!current()) {
          opened.close();
          return;
        }
        session.current = opened;
        setFrameId(opened.display.frameId);
        live.current = true;
        attempts.current = 0;
        setReconnecting(false);
        setPhase("connected");
        setTimeout(() => viewRef.current?.focus(), 100);
      } catch (err) {
        if (!current()) return;
        setReconnecting(false);
        // Nothing was sent to a server whose certificate isn't trusted yet.
        const cert = rdpCertProblem(err);
        if (cert) {
          const trust = await confirm(certPrompt(host.name || host.ip, cert));
          if (!current()) return;
          if (trust) {
            await repos.hostPrefs.set(host, RDP_CERT_PREF, cert.fingerprint);
            // Typed credentials are kept in typed.current, so they apply again.
            void reconnectRef.current();
            return;
          }
          setError("The computer's certificate was not trusted.");
          setPhase("failed");
          return;
        }
        // The phone does the login, so a refused one can be typed again right here.
        if (err instanceof SshError && err.kind === "auth") {
          typed.current = null;
          setError("That login was refused. Try again.");
          setPhase("awaiting-credentials");
          return;
        }
        const failure = fromError(err);
        setError(failure.message);
        setCanUseServer(
          !!onUseServer &&
            ["network", "proxy", "unavailable"].includes(failure.stage),
        );
        setPhase("failed");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host.id, protocol, transport, repos],
  );

  useEffect(() => {
    reconnectRef.current = () => connect();
  }, [connect]);

  // Connect once the size is known, so RDP asks for the right one.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !container.w) return;
    started.current = true;
    void connect();
  }, [container, connect]);

  useEffect(
    () => () => {
      run.current++;
      closeSession();
    },
    [],
  );

  useEffect(
    () =>
      sessionLifecycle.register({
        notifyForegrounded: () => {
          resumedAt.current = Date.now();
        },
        notifyNetworkChanged: (info) => {
          if (info.connected && info.changed) resumedAt.current = Date.now();
        },
      }),
    [],
  );

  // RDP follows rotation. The keyboard only shrinks the view, which refits.
  useEffect(() => {
    if (phase !== "connected" || protocol !== "rdp" || !container.w) return;
    const target = displayTarget(
      host,
      protocol,
      { prompt: false },
      container.w,
      Math.max(1, container.h - KEY_STRIP_HEIGHT),
      PixelRatio.get(),
    );
    const key = `${target.width}x${target.height}`;
    if (key === lastSize.current) return;
    const timer = setTimeout(() => {
      lastSize.current = key;
      session.current?.display.resize(
        target.width,
        target.height,
        target.scale,
      );
    }, RESIZE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [phase, protocol, container, host]);

  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);
  useEffect(() => {
    const report = onStatusRef.current;
    if (!report) return;
    if (reconnecting) {
      report({ state: "reconnecting", reason: "The remote desktop dropped" });
      return;
    }
    switch (phase) {
      case "connected":
        report({ state: "connected" });
        break;
      case "failed":
        report({ state: "failed", reason: error ?? undefined });
        break;
      case "disconnected":
        report({ state: "closed" });
        break;
      default:
        report({ state: "connecting" });
    }
  }, [phase, reconnecting, error]);

  const display = () => session.current?.display;

  const apply = useCallback((actions: GestureAction[]) => {
    for (const a of actions) {
      if (a.kind === "pointer") display()?.pointer(a.x, a.y, a.buttons);
      else
        setZoomPan({ zoom: a.view.zoom, panX: a.view.panX, panY: a.view.panY });
    }
  }, []);

  const send = useCallback((keysyms: number[]) => {
    const d = display();
    if (!d) return;
    keysyms.forEach((k) => d.keySym(k, true));
    [...keysyms].reverse().forEach((k) => d.keySym(k, false));
  }, []);

  const toggleHeld = (button: number) => {
    const next = held ^ button;
    setHeld(next);
    const g = gestures.current;
    if (g) {
      g.held = next;
      display()?.pointer(g.cursor.x, g.cursor.y, next);
    }
  };

  const onContainerLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainer({ w: Math.round(width), h: Math.round(height) });
  };
  const onAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ w: Math.round(width), h: Math.round(height) });
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { ...StyleSheet.absoluteFill, backgroundColor: "#000" },
        area: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: "#000",
        },
        overlay: {
          ...StyleSheet.absoluteFill,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          backgroundColor: c.bg,
        },
        title: {
          marginTop: 12,
          color: c.fg,
          fontSize: 16,
          fontWeight: "600",
          textAlign: "center",
        },
        text: {
          marginTop: 8,
          color: c.muted,
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
        clipRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
        },
      }),
    [c.bg, c.fg, c.muted],
  );

  const placement: [number, number, number] = view
    ? [fitScale(view) * view.zoom, view.panX, view.panY]
    : [1, 0, 0];
  const connected = phase === "connected" && !!frameId;

  return (
    <View
      testID="native-remote-desktop"
      pointerEvents={isVisible ? "auto" : "none"}
      style={[
        styles.container,
        { opacity: isVisible ? 1 : 0, zIndex: isVisible ? 1 : -1 },
      ]}
      onLayout={onContainerLayout}
    >
      <RdpSignInSheet
        visible={isVisible && phase === "awaiting-credentials"}
        title={`${label} sign-in`}
        showDomain={protocol === "rdp"}
        description={
          error
            ? `${error} It will not be saved.`
            : `Enter the login for ${title}. It will not be saved.`
        }
        initialUsername={displayLogin(host, protocol, null).username ?? ""}
        initialDomain={displayLogin(host, protocol, null).domain ?? ""}
        onCancel={() => {
          setError(null);
          setPhase("disconnected");
        }}
        onConnect={(creds) => void connect(creds)}
      />

      <View
        style={[styles.area, { bottom: KEY_STRIP_HEIGHT + kbOverlap }]}
        onLayout={onAreaLayout}
      >
        {frameId ? (
          <TermixDisplayView
            ref={viewRef}
            frameId={frameId}
            placement={placement}
            style={{ flex: 1 }}
            onKey={(e) => {
              const sym = keysymFor(e.nativeEvent);
              if (sym != null) display()?.keySym(sym, e.nativeEvent.down);
            }}
          />
        ) : null}
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => connected}
          onMoveShouldSetResponder={() => connected}
          onResponderGrant={(e) =>
            apply(gestures.current?.begin(points(e), Date.now()) ?? [])
          }
          onResponderStart={(e) =>
            apply(gestures.current?.begin(points(e), Date.now()) ?? [])
          }
          onResponderMove={(e) =>
            apply(gestures.current?.move(points(e)) ?? [])
          }
          onResponderEnd={(e) =>
            apply(
              gestures.current?.end(e.nativeEvent.touches.length, Date.now()) ??
                [],
            )
          }
        />
      </View>

      {(phase === "connecting" || reconnecting) && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={styles.title}>
            {reconnecting ? `Reconnecting ${label}` : `Connecting ${label}`}
          </Text>
          <Text style={styles.text}>{title}</Text>
        </View>
      )}

      {(phase === "failed" || phase === "disconnected") && !reconnecting && (
        <View style={styles.overlay}>
          <Text style={styles.title}>
            {phase === "failed" ? "Connection Failed" : "Disconnected"}
          </Text>
          {error ? <Text style={styles.text}>{error}</Text> : null}
          <Button
            variant="muted"
            onPress={() => void connect()}
            className="mt-4"
            icon={<RotateCcw size={14} color={c.fg} />}
          >
            Reconnect
          </Button>
          {canUseServer && onUseServer ? (
            <Button variant="muted" onPress={onUseServer} className="mt-2">
              Connect through the server
            </Button>
          ) : null}
        </View>
      )}

      <TextInput
        ref={inputRef}
        value=""
        onChangeText={(text) => {
          if (text) display()?.type(text);
        }}
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === "Backspace") send([0xff08]);
        }}
        onSubmitEditing={() => {
          send([0xff0d]);
          setTimeout(() => inputRef.current?.focus(), 10);
        }}
        submitBehavior="submit"
        returnKeyType="send"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={styles.hiddenInput}
      />

      {connected && (
        <RemoteKeyStrip
          bottom={kbOverlap}
          keyboardOpen={keyboardOpen}
          onKeyboard={() => inputRef.current?.focus()}
          send={send}
          onSettings={() => setShowSettings(true)}
        >
          <StripDivider />
          <StripKey
            label="L"
            active={!!(held & LEFT)}
            onPress={() => toggleHeld(LEFT)}
          />
          <StripKey
            label="M"
            active={!!(held & MIDDLE)}
            onPress={() => toggleHeld(MIDDLE)}
          />
          <StripKey
            label="R"
            active={!!(held & RIGHT)}
            onPress={() => toggleHeld(RIGHT)}
          />
        </RemoteKeyStrip>
      )}

      <RemoteSettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        mouseMode={mouseMode}
        onMouseMode={(m) => {
          setMouseMode(m);
          gestures.current?.setMode(m);
        }}
        zoom={view?.zoom ?? 1}
        onResetZoom={() => setZoomPan({ zoom: 1, panX: 0, panY: 0 })}
      >
        <View style={styles.clipRow}>
          <Button
            variant="muted"
            size="sm"
            onPress={() =>
              Clipboard.getStringAsync().then((t) => display()?.clipboard(t))
            }
          >
            Paste to remote
          </Button>
          <Button
            variant="muted"
            size="sm"
            onPress={() =>
              Clipboard.getStringAsync().then((t) => display()?.type(t))
            }
          >
            Type clipboard
          </Button>
          {remoteClip != null ? (
            <Button
              variant="muted"
              size="sm"
              onPress={() => void Clipboard.setStringAsync(remoteClip)}
            >
              Copy remote clipboard
            </Button>
          ) : null}
        </View>
      </RemoteSettingsSheet>
    </View>
  );
}
