// Terminal lab (A5 spike): one screen that runs each candidate engine on the
// same byte streams, with a frame time and memory readout. Dev builds only.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import type { TerminalInputHandle } from "@/core/features/types";
import KeyboardBar from "@/features/terminal/keyboard/KeyboardBar";
import { FrameMonitor } from "@/modules/termix-frame-monitor";
import { GHOSTTY_VIEW_MODULE } from "@/modules/termix-terminal-ghostty";
import { NATIVE_VIEW_MODULE } from "@/modules/termix-terminal-native";

import {
  ENGINES,
  buildResult,
  parseAutoRun,
  parseEngine,
  resultLine,
  type AutoRun,
  type EngineId,
} from "./autoRun";
import { round1, summarizeFrames, throughputMBs } from "./metrics";
import { createNativeSurface } from "./nativeSurface";
import {
  EchoSource,
  FloodSource,
  SshSource,
  b64,
  type LabSource,
  type SshTarget,
} from "./sources";
import {
  surfaceTheme,
  type EngineStats,
  type TerminalSurfaceHandle,
  type TerminalSurfaceProps,
} from "./surface";
import { XtermSurface } from "./XtermSurface";

const ghostty = createNativeSurface(GHOSTTY_VIEW_MODULE, "GhosttySurface");
const native = createNativeSurface(NATIVE_VIEW_MODULE, "NativeSurface");

const SURFACES: Record<
  EngineId,
  React.ComponentType<
    TerminalSurfaceProps & React.RefAttributes<TerminalSurfaceHandle>
  >
> = {
  ghostty: ghostty.Surface,
  native: native.Surface,
  xterm: XtermSurface,
};

const AVAILABLE: Record<EngineId, boolean> = {
  ghostty: ghostty.available,
  native: native.available,
  xterm: true,
};

const ENGINE_LABELS: Record<EngineId, string> = {
  ghostty: "ghostty",
  native: Platform.OS === "ios" ? "SwiftTerm" : "Termux",
  xterm: "xterm",
};

type SourceKind = "echo" | "ssh";

interface Readout {
  fps: number;
  p50: number;
  p95: number;
  max: number;
  dropped: number;
  memMb: number;
  mbps: number;
  engine: EngineStats | null;
}

function makeSource(
  kind: SourceKind,
  ssh: SshTarget,
  status: (s: string) => void,
) {
  return kind === "ssh" ? new SshSource(ssh, status) : new EchoSource();
}

export default function TerminalLab() {
  const params = useLocalSearchParams();
  const auto = useMemo(() => parseAutoRun(params), [params]);
  const ui = useUiColors();
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => surfaceTheme(), []);

  const [engine, setEngine] = useState<EngineId>(
    auto?.engine ?? parseEngine(params.engine) ?? "ghostty",
  );
  const [fontSize, setFontSize] = useState(14);
  const [sourceKind, setSourceKind] = useState<SourceKind>("echo");
  const [ssh, setSsh] = useState<SshTarget>({
    host: "",
    port: 22,
    username: "",
    password: "",
  });
  const [showSsh, setShowSsh] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [status, setStatus] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [session, setSession] = useState(0);

  const surface = useRef<TerminalSurfaceHandle>(null);
  const source = useRef<LabSource | null>(null);
  const sized = useRef(false);

  // The keyboard bar talks to this, the same handle the real terminal gives it.
  const inputHandle = useRef<TerminalInputHandle>({
    sendInput: (data: string) => source.current?.input(b64(data)),
    fit: () => {},
    isDialogOpen: () => false,
    notifyBackgrounded: () => {},
    notifyForegrounded: () => {},
    scrollToBottom: () => surface.current?.scrollToBottom(),
    isSelecting: () => false,
  });

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // A new source for each engine or source change. It starts on first resize.
  useEffect(() => {
    sized.current = false;
    source.current = makeSource(sourceKind, ssh, setStatus);
    return () => {
      source.current?.stop();
      source.current = null;
    };
    // ssh is read when connecting, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, sourceKind, session]);

  const write = useCallback((data: string) => surface.current?.write(data), []);

  const onResize = useCallback(
    (cols: number, rows: number) => {
      source.current?.resize(cols, rows);
      if (!sized.current && source.current) {
        sized.current = true;
        if (!auto) source.current.start(write);
      }
    },
    [auto, write],
  );

  // Live readout, one window per second.
  useEffect(() => {
    if (auto || !FrameMonitor) return;
    let alive = true;
    let lastBytes = 0;
    let lastAt = Date.now();
    FrameMonitor.start();
    const timer = setInterval(async () => {
      if (!FrameMonitor) return;
      const frames = await FrameMonitor.stop();
      FrameMonitor.start();
      const [mem, stats] = await Promise.all([
        FrameMonitor.memory(),
        surface.current?.getStats() ?? null,
      ]);
      const s = summarizeFrames(frames.intervalsMs, FrameMonitor.refreshRate());
      const bytes = source.current?.bytes ?? 0;
      const now = Date.now();
      if (!alive) return;
      setReadout({
        fps: round1(s.fps),
        p50: round1(s.p50),
        p95: round1(s.p95),
        max: round1(s.max),
        dropped: s.dropped,
        memMb: Math.round(mem.residentMb),
        mbps: throughputMBs(Math.max(0, bytes - lastBytes), now - lastAt),
        engine: stats,
      });
      lastBytes = bytes;
      lastAt = now;
    }, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
      FrameMonitor?.stop();
    };
  }, [auto, engine]);

  useAutoRun(auto, surface, source, write, setStatus);

  const Surface = SURFACES[engine];

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: ui.background,
        paddingTop: insets.top,
        paddingBottom: keyboardHeight > 0 ? keyboardHeight : insets.bottom,
      }}
    >
      <ScrollView
        horizontal
        style={{ flexGrow: 0, borderBottomWidth: 1, borderColor: ui.border }}
        contentContainerStyle={{ padding: 6, gap: 6 }}
      >
        {ENGINES.map((id) => (
          <Chip
            key={id}
            label={ENGINE_LABELS[id] + (AVAILABLE[id] ? "" : " (missing)")}
            active={engine === id}
            onPress={() => setEngine(id)}
          />
        ))}
        <Chip
          label="echo"
          active={sourceKind === "echo"}
          onPress={() => {
            setSourceKind("echo");
            setSession((n) => n + 1);
          }}
        />
        <Chip
          label="ssh"
          active={sourceKind === "ssh"}
          onPress={() => setShowSsh((v) => !v)}
        />
        <Chip
          label="A-"
          onPress={() => setFontSize((s) => Math.max(6, s - 1))}
        />
        <Chip
          label="A+"
          onPress={() => setFontSize((s) => Math.min(40, s + 1))}
        />
        <Chip label="copy" onPress={() => surface.current?.copySelection()} />
        <Chip
          label="paste"
          onPress={async () =>
            surface.current?.paste(await Clipboard.getStringAsync())
          }
        />
        <Chip label="kbd" onPress={() => surface.current?.focus()} />
      </ScrollView>

      {showSsh ? (
        <SshForm
          value={ssh}
          onChange={setSsh}
          onConnect={() => {
            setShowSsh(false);
            setSourceKind("ssh");
            setSession((n) => n + 1);
          }}
        />
      ) : null}

      <View style={{ flex: 1 }}>
        <Surface
          key={`${engine}-${session}`}
          ref={surface}
          style={{ flex: 1 }}
          fontSize={fontSize}
          theme={theme}
          onInput={(data) => source.current?.input(data)}
          onResize={onResize}
          onTitle={setStatus}
        />
        {readout ? <ReadoutView r={readout} status={status} /> : null}
      </View>

      <KeyboardBar terminalRef={inputHandle} isVisible bottomInset={0} />
    </View>
  );
}

/** Runs one scenario for CI and logs a TXRESULT line. */
function useAutoRun(
  run: AutoRun | null,
  surface: React.RefObject<TerminalSurfaceHandle | null>,
  source: React.RefObject<LabSource | null>,
  write: (data: string) => void,
  setStatus: (s: string) => void,
) {
  useEffect(() => {
    if (!run || !FrameMonitor) return;
    const monitor = FrameMonitor;
    let cancelled = false;
    let flood: FloodSource | null = null;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      // Let the engine size itself and settle.
      await sleep(3000);
      if (cancelled) return;
      const echo = source.current as EchoSource | null;
      echo?.start(write);
      await sleep(1000);
      const memStart = (await monitor.memory()).residentMb;
      let memPeak = memStart;
      await monitor.start();
      const startedAt = Date.now();

      const bytesAtStart = echo?.bytes ?? 0;
      let active: LabSource | null = echo;
      if (run.scenario === "yes" || run.scenario === "log") {
        flood = new FloodSource(run.scenario, run.rate);
        flood.start(write);
        active = flood;
      } else if (run.scenario === "alt") {
        echo?.startAlt();
      } else if (run.scenario === "echo") {
        // Typing speed: one key every 50 ms.
        const keys = "the quick brown fox jumps over the lazy dog\r";
        let i = 0;
        const typer = setInterval(
          () => echo?.input(b64(keys[i++ % keys.length])),
          50,
        );
        setTimeout(() => clearInterval(typer), run.seconds * 1000);
      }

      for (let s = 0; s < run.seconds && !cancelled; s++) {
        await sleep(1000);
        memPeak = Math.max(memPeak, (await monitor.memory()).residentMb);
      }
      flood?.stop();
      const elapsedMs = Date.now() - startedAt;
      const frames = await monitor.stop();
      const engineStats = (await surface.current?.getStats()) ?? null;
      const result = buildResult({
        run,
        platform: Platform.OS,
        refreshHz: monitor.refreshRate(),
        intervalsMs: frames.intervalsMs,
        frameTotalsMs: frames.frameTotalsMs,
        engine: engineStats as Record<string, number | undefined> | null,
        bytes:
          active === echo
            ? (echo?.bytes ?? 0) - bytesAtStart
            : (active?.bytes ?? 0),
        elapsedMs,
        memStartMb: memStart,
        memPeakMb: memPeak,
      });
      monitor.log(resultLine(result));
      setStatus("done");
    })();

    return () => {
      cancelled = true;
      flood?.stop();
    };
  }, [run, surface, source, write, setStatus]);
}

function Chip(props: { label: string; active?: boolean; onPress: () => void }) {
  const ui = useUiColors();
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingHorizontal: 10,
        height: 30,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: props.active ? ui.brand : ui.border,
        backgroundColor: props.active ? ui.active : ui.surface,
      }}
    >
      <Text className="text-xs text-foreground">{props.label}</Text>
    </Pressable>
  );
}

function ReadoutView({ r, status }: { r: Readout; status: string }) {
  const lines = [
    `${r.fps} fps | p50 ${r.p50} | p95 ${r.p95} | max ${r.max} ms`,
    `dropped ${r.dropped} | ${r.memMb} MB | ${r.mbps} MB/s`,
  ];
  if (r.engine?.renderMsP50 != null) {
    lines.push(
      `draw p50 ${round1(r.engine.renderMsP50)} | p95 ${round1(r.engine.renderMsP95 ?? 0)} ms`,
    );
  }
  if (status) lines.push(status);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        right: 4,
        top: 4,
        padding: 6,
        backgroundColor: "rgba(0,0,0,0.7)",
      }}
    >
      {lines.map((l) => (
        <Text key={l} className="text-[10px] text-white">
          {l}
        </Text>
      ))}
    </View>
  );
}

function SshForm(props: {
  value: SshTarget;
  onChange: (v: SshTarget) => void;
  onConnect: () => void;
}) {
  const ui = useUiColors();
  const field = (key: keyof SshTarget, placeholder: string, secure = false) => (
    <TextInput
      value={String(props.value[key] || "")}
      placeholder={placeholder}
      placeholderTextColor={ui.textFaint}
      secureTextEntry={secure}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={key === "port" ? "number-pad" : "default"}
      onChangeText={(t) =>
        props.onChange({
          ...props.value,
          [key]: key === "port" ? Number(t) || 22 : t,
        })
      }
      style={{
        flex: 1,
        minWidth: 90,
        height: 34,
        paddingHorizontal: 8,
        color: ui.text,
        borderWidth: 1,
        borderColor: ui.border,
        backgroundColor: ui.surface,
      }}
    />
  );
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        padding: 6,
        borderBottomWidth: 1,
        borderColor: ui.border,
      }}
    >
      {field("host", "host")}
      {field("port", "22")}
      {field("username", "user")}
      {field("password", "password", true)}
      <Chip label="connect" onPress={props.onConnect} />
    </View>
  );
}
