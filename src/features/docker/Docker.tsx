import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
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
  ShieldCheck,
} from "lucide-react-native";
import {
  SSHHost,
  DockerContainer,
  DockerContainerAction,
  SessionAuthOverrides,
} from "@/types";
import { Text, Input, Badge, Tabs, Button, useConfirm } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import { useExecTarget, usePoll, type ExecRunner } from "@/core/exec";
import {
  SessionFrame,
  useSessionConnect,
  AuthDialogs,
  ContextSheet,
  ExecGate,
  type ContextAction,
} from "@/screens/sessions/shared";
import { useSessionClient } from "@/core/accounts/session";
import { ContainerDetail } from "./ContainerDetail";
import { StacksView } from "./StacksView";
import { createLocalDockerBackend } from "./backend/local";
import { createRelayDockerBackend } from "./backend/relay";
import type { DockerBackend, DockerCheck } from "./backend/types";

interface DockerProps {
  host: SSHHost;
  isVisible: boolean;
}

type StatusFilter = "all" | "running" | "stopped";
type Section = "containers" | "stacks";

export function isRunning(c: DockerContainer): boolean {
  return /^up|running/i.test(c.state || c.status || "");
}

export function cleanName(name: string): string {
  return name.startsWith("/") ? name.slice(1) : name;
}

const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/** Docker for a host: over the phone's SSH, or the server's Docker plugin. */
export function Docker({ host, isVisible }: DockerProps) {
  const { target, retry, switchOrigin } = useExecTarget(
    host,
    "docker",
    isVisible,
  );
  if (!isVisible) return null;
  return (
    <ExecGate
      target={target}
      onRetry={() => void retry()}
      onSwitch={switchOrigin}
      local={(runner) => <LocalDocker host={host} runner={runner} />}
      relay={(serverHost) => <RelayDocker host={serverHost} />}
    />
  );
}

function preferredRuntime(host: SSHHost): "docker" | "podman" {
  return host.pluginSettings?.docker?.containerRuntime === "podman"
    ? "podman"
    : "docker";
}

function LocalDocker({ host, runner }: { host: SSHHost; runner: ExecRunner }) {
  const [sudo, setSudo] = useState(false);
  const backend = useMemo(
    () =>
      createLocalDockerBackend(runner, {
        prefer: preferredRuntime(host),
        sudo,
      }),
    [runner, host, sudo],
  );
  return (
    <DockerView
      host={host}
      backend={backend}
      onUseSudo={sudo ? undefined : () => setSudo(true)}
    />
  );
}

/** Opens the server's Docker session for `host`, then shows the same view. */
function RelayDocker({ host }: { host: SSHHost }) {
  const client = useSessionClient();
  const [ready, setReady] = useState(false);
  const transport = useMemo(
    () => ({
      prefix: "docker",
      connect: (
        sessionId: string,
        h: SSHHost,
        _userId: string | undefined,
        overrides: SessionAuthOverrides,
      ) => client.api.docker.dockerConnect(sessionId, h.id, overrides),
      submitTotp: (sessionId: string, code: string) =>
        client.api.docker.dockerConnectTOTP(sessionId, code),
      submitWarpgate: (sessionId: string, url: string, key?: string) =>
        client.api.docker.dockerConnectBrowserSignIn(sessionId, url, key),
      keepAlive: (sessionId: string) =>
        client.api.docker.dockerKeepAlive(sessionId),
      disconnect: (sessionId: string) =>
        client.api.docker.dockerDisconnect(sessionId),
    }),
    [client],
  );
  const conn = useSessionConnect(host, transport, async () => setReady(true), {
    autoConnect: true,
    keepAliveMs: 30000,
  });
  const sessionRef = useRef(conn.sessionId);
  sessionRef.current = conn.sessionId;
  const backend = useMemo(
    () =>
      createRelayDockerBackend(
        client,
        () => sessionRef.current.current ?? "",
        host,
      ),
    [client, host],
  );

  const dialogs = (
    <AuthDialogs
      state={conn.state}
      errorMessage={conn.errorMessage}
      onSubmitTotp={conn.submitTotp}
      onSubmitWarpgate={conn.submitWarpgate}
      browserSignIn={conn.browserSignIn}
      onSubmitAuth={conn.submitAuth}
      onCancel={conn.cancelAuth}
    />
  );

  if (conn.state !== "connected" || !ready) {
    return (
      <>
        <SessionFrame
          title={host.name}
          subtitle="Docker"
          status={conn.state === "error" ? "error" : "loading"}
          loadingLabel="Connecting to Docker..."
          errorMessage={conn.errorMessage}
          failure={conn.state === "error" ? conn.failure : null}
          onRetry={conn.state === "error" ? conn.retry : undefined}
          logEntries={conn.logEntries}
          isConnecting={conn.state === "connecting" || conn.state === "idle"}
          isConnected={false}
          hasConnectionError={conn.state === "error"}
          onLogClear={conn.logClear}
        />
        {dialogs}
      </>
    );
  }
  return (
    <>
      <DockerView host={host} backend={backend} />
      {dialogs}
    </>
  );
}

export function DockerView({
  host,
  backend,
  onUseSudo,
}: {
  host: SSHHost;
  backend: DockerBackend;
  /** Offered when the login user can't reach the Docker daemon. */
  onUseSudo?: () => void;
}) {
  const color = useThemeColor();
  const confirm = useConfirm();
  const [section, setSection] = useState<Section>("containers");
  const [check, setCheck] = useState<DockerCheck | null>(null);
  const [checkError, setCheckError] = useState("");
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<DockerContainer | null>(null);
  const [menuFor, setMenuFor] = useState<DockerContainer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        let current = check;
        if (!current?.available) {
          current = await backend.check();
          setCheck(current);
          setCheckError("");
          if (!current.available) return;
        }
        setContainers(await backend.containers(signal));
      } catch (e) {
        if (signal?.aborted) return;
        if (!check) setCheckError(errorText(e, "Docker did not answer"));
        else toast.error(errorText(e, "Failed to load containers"));
      } finally {
        if (!signal?.aborted) setLoaded(true);
      }
    },
    [backend, check],
  );

  usePoll(load, {
    intervalMs: 5000,
    enabled: section === "containers" && !selected,
  });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const runAction = useCallback(
    async (c: DockerContainer, action: DockerContainerAction) => {
      const name = cleanName(c.name);
      if (action === "remove" || action === "stop") {
        const ok = await confirm({
          title: action === "remove" ? `Remove ${name}?` : `Stop ${name}?`,
          description:
            action === "remove"
              ? "The container is stopped and deleted. Its volumes stay."
              : "Anything running in it stops.",
          confirmLabel: action === "remove" ? "Remove" : "Stop",
          destructive: true,
        });
        if (!ok) return false;
      }
      setBusyId(c.id);
      try {
        await backend.action(c.id, action);
        toast.success(`${action} | ${name}`);
        await load();
        return true;
      } catch (e) {
        toast.error(errorText(e, `Failed to ${action}`));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [backend, load, confirm],
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

  if (selected) {
    return (
      <ContainerDetail
        backend={backend}
        container={selected}
        onBack={() => setSelected(null)}
        onAction={runAction}
      />
    );
  }

  const unavailable = check && !check.available;
  const frameStatus = !loaded
    ? "loading"
    : checkError
      ? "error"
      : unavailable
        ? "empty"
        : section === "containers" && filtered.length === 0
          ? "empty"
          : "ready";

  return (
    <>
      <SessionFrame
        title={host.name}
        subtitle={backend.via === "local" ? "Docker | this phone" : "Docker"}
        status={frameStatus}
        loadingLabel="Looking for Docker..."
        errorMessage={checkError}
        onRetry={checkError ? () => void refresh() : undefined}
        emptyMessage={
          unavailable
            ? (check?.error ?? "Docker is not available on this host.")
            : containers.length === 0
              ? "No containers found"
              : "No containers match your filters"
        }
        emptyIcon={
          unavailable && check?.code === "PERMISSION_DENIED" && onUseSudo ? (
            <View className="items-center gap-3">
              <ShieldCheck size={32} color={color("muted-foreground")} />
              <Button size="sm" onPress={onUseSudo}>
                Use sudo
              </Button>
            </View>
          ) : (
            <ContainerIcon size={32} color={color("muted-foreground")} />
          )
        }
        headerActions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh"
            onPress={refresh}
            disabled={refreshing}
            hitSlop={8}
            className={`p-1.5 ${refreshing ? "opacity-40" : "active:bg-muted/40"}`}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={color("accent-brand")} />
            ) : (
              <RefreshCw size={16} color={color("muted-foreground")} />
            )}
          </Pressable>
        }
        toolbar={
          loaded && !unavailable && !checkError ? (
            <View className="gap-2.5 px-3 py-2.5">
              <Tabs<Section>
                value={section}
                onChange={setSection}
                options={[
                  { id: "containers", label: "Containers" },
                  { id: "stacks", label: "Stacks" },
                ]}
              />
              {section === "containers" ? (
                <>
                  <Input
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search containers..."
                    autoCapitalize="none"
                    autoCorrect={false}
                    leading={
                      <Search size={15} color={color("muted-foreground")} />
                    }
                  />
                  <Tabs<StatusFilter>
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { id: "all", label: "All" },
                      { id: "running", label: "Running" },
                      { id: "stopped", label: "Stopped" },
                    ]}
                  />
                </>
              ) : null}
            </View>
          ) : undefined
        }
      >
        {section === "stacks" ? (
          <StacksView backend={backend} />
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              flexGrow: 1,
              padding: 12,
              gap: 8,
              paddingBottom: 120,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={color("accent-brand")}
                onRefresh={refresh}
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
        )}
      </SessionFrame>

      <ContextSheet
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor ? cleanName(menuFor.name) : undefined}
        subtitle={menuFor?.image}
        actions={buildActions(menuFor, color, (c, a) => void runAction(c, a))}
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
      className="border border-border bg-card px-3 py-3 active:bg-muted/30"
    >
      <View className="flex-row items-center gap-2.5">
        <View
          style={{
            backgroundColor: running
              ? "#22c55e"
              : color("muted-foreground", 0.4),
          }}
          className="h-2.5 w-2.5 rounded-full"
        />
        <ContainerIcon size={15} color={color("muted-foreground")} />
        <View className="min-w-0 flex-1">
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
        {busy ? (
          <ActivityIndicator size="small" color={color("accent-brand")} />
        ) : (
          <Badge variant={running ? "success" : "muted"}>
            {running ? "running" : container.state || "stopped"}
          </Badge>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More actions"
          onPress={onMenu}
          hitSlop={8}
          disabled={busy}
          className="pl-1"
        >
          <MoreVertical size={16} color={color("muted-foreground")} />
        </Pressable>
      </View>
    </Pressable>
  );
}
