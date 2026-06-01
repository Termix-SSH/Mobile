import { useCallback, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  ArrowLeft,
  Copy,
  Play,
  Square,
  RotateCcw,
  Trash2,
} from "lucide-react-native";
import { SSHHost, DockerContainer, DockerContainerAction } from "@/types";
import {
  getDockerContainerLogs,
  getDockerContainerStats,
} from "@/app/main-axios";
import { Text, Badge, SegmentedControl } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { MONO_FONT } from "@/app/constants/fonts";
import { toast } from "@/app/utils/toast";
import { usePolling } from "@/app/tabs/sessions/_shared";
import { DockerConsole } from "./DockerConsole";
import type { DockerContainerStats } from "@/types";

type DetailTab = "logs" | "stats" | "console";

function isRunning(c: DockerContainer): boolean {
  return /^up|running/i.test(c.state || c.status || "");
}
function cleanName(name: string): string {
  return name.startsWith("/") ? name.slice(1) : name;
}

/**
 * Full-frame container detail: header with quick actions + a Logs / Stats /
 * Console tab strip. Logs poll; Stats poll (every 2s while running); Console is
 * an interactive exec shell over the docker-console WebSocket.
 */
export function ContainerDetail({
  host,
  sessionId,
  container,
  onBack,
  onAction,
}: {
  host: SSHHost;
  sessionId: string;
  container: DockerContainer;
  onBack: () => void;
  onAction: (c: DockerContainer, a: DockerContainerAction) => void;
}) {
  const color = useThemeColor();
  const [tab, setTab] = useState<DetailTab>("logs");
  const running = isRunning(container);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center gap-2.5 px-3 py-3 border-b border-border">
        <Pressable onPress={onBack} hitSlop={8} className="p-1">
          <ArrowLeft size={18} color={color("foreground")} />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text
            weight="bold"
            className="text-base text-foreground"
            numberOfLines={1}
          >
            {cleanName(container.name)}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {container.image}
          </Text>
        </View>
        <Badge variant={running ? "success" : "muted"}>
          {running ? "running" : container.state || "stopped"}
        </Badge>
      </View>

      {/* Quick actions */}
      <View className="flex-row gap-1.5 px-3 py-2 border-b border-border">
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
            onAction(container, "remove");
            onBack();
          }}
        />
      </View>

      {/* Tab strip */}
      <View className="px-3 py-2 border-b border-border">
        <SegmentedControl<DetailTab>
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
          <LogsTab sessionId={sessionId} container={container} />
        ) : tab === "stats" ? (
          <StatsTab
            sessionId={sessionId}
            container={container}
            running={running}
          />
        ) : (
          <DockerConsole host={host} container={container} isVisible />
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
      className={`flex-row items-center gap-1 px-2.5 py-1.5 border active:opacity-80 ${
        accent
          ? "border-accent-brand/40 bg-accent-brand/10"
          : destructive
            ? "border-destructive/40"
            : "border-border"
      }`}
    >
      {icon}
      <Text
        className={`text-[11px] ${accent ? "text-accent-brand" : destructive ? "text-destructive" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function LogsTab({
  sessionId,
  container,
}: {
  sessionId: string;
  container: DockerContainer;
}) {
  const color = useThemeColor();
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const text = await getDockerContainerLogs(sessionId, container.id, 300);
      setLogs(text || "(no output)");
    } catch (e: any) {
      setLogs(e?.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [sessionId, container.id]);

  usePolling(load, 4000, true);

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
      <View className="flex-row justify-end px-3 py-1.5 border-b border-border">
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
  sessionId,
  container,
  running,
}: {
  sessionId: string;
  container: DockerContainer;
  running: boolean;
}) {
  const color = useThemeColor();
  const [stats, setStats] = useState<DockerContainerStats | null>(null);
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    if (!running) return;
    try {
      const data = await getDockerContainerStats(sessionId, container.id);
      setStats(data);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Failed to load stats");
    }
  }, [sessionId, container.id, running]);

  usePolling(load, 2000, running);

  if (!running) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-sm text-muted-foreground text-center">
          Container is not running — no live stats.
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-sm text-destructive text-center">{error}</Text>
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
    <View className="px-3 py-3 bg-card border border-border">
      <Text className="text-[10px] uppercase tracking-[1px] text-muted-foreground">
        {label}
      </Text>
      <Text weight="bold" className="text-base text-foreground mt-0.5">
        {value}
      </Text>
      {sub ? (
        <Text className="text-[11px] text-muted-foreground mt-0.5">{sub}</Text>
      ) : null}
    </View>
  );
}
