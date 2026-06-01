import { useCallback, useMemo, useState } from "react";
import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import {
  Container as ContainerIcon,
  Search,
  RefreshCw,
  Play,
  Square,
  RotateCcw,
  Pause,
  Trash2,
  MoreVertical,
} from "lucide-react-native";
import { SSHHost, DockerContainer, DockerContainerAction } from "@/types";
import {
  dockerConnect,
  dockerConnectTOTP,
  dockerKeepAlive,
  dockerDisconnect,
  dockerValidate,
  getDockerContainers,
  dockerContainerAction,
} from "@/app/main-axios";
import { Text, Input, Badge, SegmentedControl } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
import {
  SessionFrame,
  usePolling,
  useSessionConnect,
  AuthDialogs,
  ContextSheet,
  type ContextAction,
} from "@/app/tabs/sessions/_shared";
import { ContainerDetail } from "./ContainerDetail";

interface DockerProps {
  host: SSHHost;
  isVisible: boolean;
}

type StatusFilter = "all" | "running" | "stopped";

function isRunning(c: DockerContainer): boolean {
  return /^up|running/i.test(c.state || c.status || "");
}

function cleanName(name: string): string {
  return name.startsWith("/") ? name.slice(1) : name;
}

export function Docker({ host, isVisible }: DockerProps) {
  const color = useThemeColor();
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<DockerContainer | null>(null);
  const [menuFor, setMenuFor] = useState<DockerContainer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const loadContainers = useCallback(
    async (sessionId: string) => {
      try {
        const list = await getDockerContainers(sessionId);
        setContainers(list);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load containers");
      }
    },
    [],
  );

  const connectTransport = useMemo(
    () => ({
      prefix: "docker",
      connect: (sessionId: string, h: SSHHost) =>
        dockerConnect(sessionId, h.id),
      submitTotp: (sessionId: string, code: string) =>
        dockerConnectTOTP(sessionId, code),
      keepAlive: (sessionId: string) => dockerKeepAlive(sessionId),
      disconnect: (sessionId: string) => dockerDisconnect(sessionId),
    }),
    [],
  );

  const onConnected = useCallback(
    async (sessionId: string) => {
      setInitialLoadDone(false);
      // Confirm Docker is actually installed before listing.
      try {
        const v = await dockerValidate(sessionId);
        setDockerAvailable(v.available);
        if (!v.available) {
          setInitialLoadDone(true);
          return;
        }
      } catch {
        setDockerAvailable(true); // assume available; list call will surface real errors
      }
      await loadContainers(sessionId);
      setInitialLoadDone(true);
    },
    [loadContainers],
  );

  const conn = useSessionConnect(
    isVisible ? host : null,
    connectTransport,
    onConnected,
    { autoConnect: true, keepAliveMs: 30000 },
  );

  // Poll the container list while connected and visible.
  usePolling(
    () => {
      if (conn.state === "connected" && conn.sessionId.current) {
        loadContainers(conn.sessionId.current);
      }
    },
    5000,
    isVisible && conn.state === "connected",
  );

  const runAction = useCallback(
    async (c: DockerContainer, action: DockerContainerAction) => {
      const sessionId = conn.sessionId.current;
      if (!sessionId) return;
      setBusyId(c.id);
      try {
        await dockerContainerAction(sessionId, c.id, action);
        toast.success(`${action} · ${cleanName(c.name)}`);
        await loadContainers(sessionId);
      } catch (e: any) {
        toast.error(e?.message || `Failed to ${action}`);
      } finally {
        setBusyId(null);
      }
    },
    [conn.sessionId, loadContainers],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return containers.filter((c) => {
      if (statusFilter === "running" && !isRunning(c)) return false;
      if (statusFilter === "stopped" && isRunning(c)) return false;
      if (!q) return true;
      return (
        cleanName(c.name).toLowerCase().includes(q) ||
        c.image?.toLowerCase().includes(q) ||
        c.id?.toLowerCase().includes(q)
      );
    });
  }, [containers, query, statusFilter]);

  if (!isVisible) return null;

  // Detail view takes over the whole frame.
  if (selected) {
    return (
      <ContainerDetail
        host={host}
        sessionId={conn.sessionId.current}
        container={selected}
        onBack={() => setSelected(null)}
        onAction={runAction}
      />
    );
  }

  // Map connect-state → SessionFrame status.
  const frameStatus =
    conn.state === "connecting" || conn.state === "idle" || (conn.state === "connected" && !initialLoadDone)
      ? "loading"
      : conn.state === "error"
        ? "error"
        : dockerAvailable === false
          ? "empty"
          : filtered.length === 0
            ? "empty"
            : "ready";

  return (
    <>
      <SessionFrame
        title={host.name}
        subtitle="Docker"
        status={frameStatus}
        loadingLabel="Connecting to Docker…"
        errorMessage={conn.errorMessage}
        emptyMessage={
          dockerAvailable === false
            ? "Docker is not installed or not running on this host."
            : containers.length === 0
              ? "No containers found"
              : "No containers match your filters"
        }
        emptyIcon={<ContainerIcon size={32} color={color("muted-foreground")} />}
        onRetry={conn.state === "error" ? conn.retry : undefined}
        logEntries={conn.logEntries}
        isConnecting={conn.state === "connecting" || conn.state === "idle"}
        isConnected={conn.state === "connected"}
        hasConnectionError={conn.state === "error"}
        onLogClear={conn.logClear}
        headerActions={
          <Pressable
            onPress={() =>
              conn.sessionId.current &&
              loadContainers(conn.sessionId.current)
            }
            hitSlop={8}
            className="p-1.5"
          >
            <RefreshCw size={16} color={color("muted-foreground")} />
          </Pressable>
        }
        toolbar={
          conn.state === "connected" && dockerAvailable !== false ? (
            <View className="px-3 py-2.5 gap-2.5">
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="Search containers…"
                autoCapitalize="none"
                autoCorrect={false}
                leading={<Search size={15} color={color("muted-foreground")} />}
              />
              <SegmentedControl<StatusFilter>
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { id: "all", label: "All" },
                  { id: "running", label: "Running" },
                  { id: "stopped", label: "Stopped" },
                ]}
              />
            </View>
          ) : undefined
        }
      >
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={color("accent-brand")}
              onRefresh={async () => {
                setRefreshing(true);
                if (conn.sessionId.current)
                  await loadContainers(conn.sessionId.current);
                setRefreshing(false);
              }}
            />
          }
        >
          {filtered.map((c) => (
            <ContainerRow
              key={c.id}
              container={c}
              busy={busyId === c.id}
              onPress={() => setSelected(c)}
              onMenu={() => setMenuFor(c)}
            />
          ))}
        </ScrollView>
      </SessionFrame>

      {/* Container action menu */}
      <ContextSheet
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor ? cleanName(menuFor.name) : undefined}
        subtitle={menuFor?.image}
        actions={buildActions(menuFor, color, runAction)}
      />

      {/* Shared auth dialogs (TOTP / Warpgate / interactive) */}
      <AuthDialogs
        state={conn.state}
        errorMessage={conn.errorMessage}
        onSubmitTotp={conn.submitTotp}
        onSubmitWarpgate={conn.submitWarpgate}
        onSubmitAuth={conn.submitAuth}
        onCancel={conn.cancelAuth}
      />
    </>
  );
}

function buildActions(
  c: DockerContainer | null,
  color: ReturnType<typeof useThemeColor>,
  run: (c: DockerContainer, a: DockerContainerAction) => void,
): (ContextAction | null)[] {
  if (!c) return [];
  const running = isRunning(c);
  const fg = color("foreground") ?? "#fafafa";
  return [
    running
      ? null
      : {
          key: "start",
          icon: <Play size={18} color={color("accent-brand")} />,
          label: "Start",
          onPress: () => run(c, "start"),
        },
    running
      ? {
          key: "stop",
          icon: <Square size={18} color={fg} />,
          label: "Stop",
          onPress: () => run(c, "stop"),
        }
      : null,
    {
      key: "restart",
      icon: <RotateCcw size={18} color={fg} />,
      label: "Restart",
      onPress: () => run(c, "restart"),
    },
    running
      ? {
          key: "pause",
          icon: <Pause size={18} color={fg} />,
          label: "Pause",
          onPress: () => run(c, "pause"),
        }
      : {
          key: "unpause",
          icon: <Play size={18} color={fg} />,
          label: "Unpause",
          onPress: () => run(c, "unpause"),
        },
    {
      key: "remove",
      icon: <Trash2 size={18} color={color("destructive")} />,
      label: "Remove",
      destructive: true,
      onPress: () => run(c, "remove"),
    },
  ];
}

function ContainerRow({
  container,
  busy,
  onPress,
  onMenu,
}: {
  container: DockerContainer;
  busy: boolean;
  onPress: () => void;
  onMenu: () => void;
}) {
  const color = useThemeColor();
  const running = isRunning(container);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMenu}
      className="px-3 py-3 bg-card border border-border active:bg-muted/30"
    >
      <View className="flex-row items-center gap-2.5">
        <View
          style={{
            backgroundColor: running ? "#22c55e" : color("muted-foreground", 0.4),
          }}
          className="w-2.5 h-2.5 rounded-full"
        />
        <ContainerIcon size={15} color={color("muted-foreground")} />
        <View className="flex-1 min-w-0">
          <Text
            weight="medium"
            className="text-sm text-foreground"
            numberOfLines={1}
          >
            {cleanName(container.name)}
          </Text>
          <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
            {container.image}
          </Text>
        </View>
        <Badge variant={running ? "success" : "muted"}>
          {running ? "running" : container.state || "stopped"}
        </Badge>
        <Pressable onPress={onMenu} hitSlop={8} disabled={busy} className="pl-1">
          <MoreVertical size={16} color={color("muted-foreground")} />
        </Pressable>
      </View>
    </Pressable>
  );
}
