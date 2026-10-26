import { useCallback, useState } from "react";
import { ScreenHeader } from "@/components/Screen";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Copy, Play, Square, RotateCcw, Trash2 } from "lucide-react-native";
import { DockerContainer, DockerContainerAction } from "@/types";
import { Text, Badge, Tabs } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { MONO_FONT } from "@/constants/fonts";
import { toast } from "@/utils/toast";
import { usePoll } from "@/core/exec";
import { DockerConsole } from "./DockerConsole";
import type { DockerContainerStats } from "@/types";
import type { DockerBackend } from "./backend/types";

type DetailTab = "logs" | "stats" | "console";

function isRunning(c: DockerContainer): boolean {
  return /^up|running/i.test(c.state || c.status || "");
}
function cleanName(name: string): string {
  return name.startsWith("/") ? name.slice(1) : name;
}
const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/**
 * Full-frame container detail: header with quick actions + a Logs / Stats /
 * Console tab strip. Logs poll; Stats poll (every 2s while running); Console is
 * an interactive shell in the container.
 */
export function ContainerDetail({
  backend,
  container,
  onBack,
  onAction,
}: {
  backend: DockerBackend;
  container: DockerContainer;
  onBack: () => void;
  /** Resolves true when the action ran. */
  onAction: (c: DockerContainer, a: DockerContainerAction) => Promise<boolean>;
}) {
  const color = useThemeColor();
  const [tab, setTab] = useState<DetailTab>("logs");
  const running = isRunning(container);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={cleanName(container.name)}
        subtitle={container.image}
        onBack={onBack}
        headerRight={
          <Badge variant={running ? "success" : "muted"}>
            {running ? "running" : container.state || "stopped"}
          </Badge>
        }
      />

      {/* Quick actions */}
      <View className="flex-row gap-1.5 border-b border-border px-3 py-2">
        {running ? (
          <ActionChip
            icon={<Square size={13} color={color("foreground")} />}
            label="Stop"
            onPress={() => onAction(container, "stop")}
          />
        ) : (
          <ActionChip
            icon={<Play size={13} color={color("accent-brand")} />}
            label="Start"
            accent
            onPress={() => onAction(container, "start")}
          />
        )}
        <ActionChip
          icon={<RotateCcw size={13} color={color("foreground")} />}
          label="Restart"
          onPress={() => onAction(container, "restart")}
        />
        <ActionChip
          icon={<Trash2 size={13} color={color("destructive")} />}
          label="Remove"
          destructive
          onPress={() => {
            void onAction(container, "remove").then((ok) => ok && onBack());
          }}
        />
      </View>

      {/* Tab strip */}
      <View className="border-b border-border px-3 py-2">
        <Tabs<DetailTab>
          value={tab}
          onChange={setTab}
          options={[
            { id: "logs", label: "Logs" },
            { id: "stats", label: "Stats" },
            { id: "console", label: "Console" },
          ]}
        />
      </View>

      {/* Tab content */}
      <View className="flex-1">
        {tab === "logs" ? (
          <LogsTab backend={backend} container={container} />
        ) : tab === "stats" ? (
          <StatsTab backend={backend} container={container} running={running} />
        ) : (
          <DockerConsole
            target={backend.console()}
            container={container}
            isVisible
          />
        )}
      </View>
    </View>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
  accent,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  accent?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1 border px-2.5 py-1.5 active:opacity-80 ${
        accent
          ? "border-accent-brand/40 bg-accent-brand/10"
          : destructive
            ? "border-destructive/40"
            : "border-border"
      }`}
    >
      {icon}
      <Text
        className={`text-[11px] ${accent ? "text-accent-text" : destructive ? "text-destructive-text" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function LogsTab({
  backend,
  container,
}: {
  backend: DockerBackend;
  container: DockerContainer;
}) {
  const color = useThemeColor();
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const text = await backend.logs(container.id, 300, signal);
        setLogs(text || "(no output)");
      } catch (e) {
        if (!signal.aborted) setLogs(errorText(e, "Failed to load logs"));
      } finally {
        setLoading(false);
      }
    },
    [backend, container.id],
  );

  usePoll(load, { intervalMs: 4000 });

  const copy = async () => {
    await Clipboard.setStringAsync(logs);
    toast.success("Logs copied");
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={color("accent-brand")} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="flex-row justify-end border-b border-border px-3 py-1.5">
        <Pressable
          onPress={copy}
          hitSlop={6}
          className="flex-row items-center gap-1"
        >
          <Copy size={13} color={color("muted-foreground")} />
          <Text className="text-[11px] text-muted-foreground">Copy</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <Text
          className="text-[11px] text-muted-foreground"
          style={{ fontFamily: MONO_FONT }}
        >
          {logs}
        </Text>
      </ScrollView>
    </View>
  );
}

function StatsTab({
  backend,
  container,
  running,
}: {
  backend: DockerBackend;
  container: DockerContainer;
  running: boolean;
}) {
  const color = useThemeColor();
  const [stats, setStats] = useState<DockerContainerStats | null>(null);
  const [error, setError] = useState<string>("");

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!running) return;
      try {
        setStats(await backend.stats(container.id, signal));
        setError("");
      } catch (e) {
        if (!signal.aborted) setError(errorText(e, "Failed to load stats"));
      }
    },
    [backend, container.id, running],
  );

  usePoll(load, { intervalMs: 2000, enabled: running });

  if (!running) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-muted-foreground">
          Container is not running, no live stats.
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-destructive-text">
          {error}
        </Text>
      </View>
    );
  }

  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={color("accent-brand")} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
      <StatCard label="CPU" value={stats.cpu} />
      <StatCard
        label="Memory"
        value={`${stats.memoryUsed} / ${stats.memoryLimit}`}
        sub={stats.memoryPercent}
      />
      <StatCard
        label="Network I/O"
        value={`↓ ${stats.netInput}   ↑ ${stats.netOutput}`}
      />
      <StatCard
        label="Block I/O"
        value={`R ${stats.blockRead}   W ${stats.blockWrite}`}
      />
      <StatCard label="PIDs" value={stats.pids} />
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View className="border border-border bg-card px-3 py-3">
      <Text className="text-[10px] uppercase tracking-[1px] text-muted-foreground">
        {label}
      </Text>
      <Text weight="bold" className="mt-0.5 text-base text-foreground">
        {value}
      </Text>
      {sub ? (
        <Text className="mt-0.5 text-[11px] text-muted-foreground">{sub}</Text>
      ) : null}
    </View>
  );
}
