import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { View, ScrollView, RefreshControl, Pressable } from "react-native";
import { Zap } from "lucide-react-native";
import { ServerMetrics, SSHHost } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import { SessionFrame, ExecGate } from "@/screens/sessions/shared";
import {
  StatsConfig,
  WidgetType,
  DEFAULT_STATS_CONFIG,
} from "@/constants/stats-config";
import {
  CpuWidget,
  MemoryWidget,
  DiskWidget,
  NetworkWidget,
  UptimeWidget,
  SystemWidget,
  ProcessesWidget,
  PortsWidget,
  FirewallWidget,
  LoginStatsWidget,
  TemperatureWidget,
  GpuWidget,
} from "./widgets";
import { useClient } from "@/core/accounts";
import { useSessionAccountId } from "@/core/accounts/session";
import type { AccountClient } from "@/core/api/AccountClient";
import { useSessionRepositories } from "@/core/data/hooks";
import type { MetricPoint } from "@/core/data/types";
import { useExecTarget, usePoll, type ExecRunner } from "@/core/exec";
import { createLocalMetrics } from "./backend/local";
import { HistoryCard, type HistoryRange } from "./HistoryCard";
import {
  LIVE_MAX_ERRORS,
  LIVE_POLL_MS,
  LIVE_RETRY_MS,
  mergeLive,
  type LiveSample,
} from "./live";

interface ServerStatsProps {
  host: SSHHost;
  isVisible: boolean;
  title?: string;
  onClose?: () => void;
}

export interface ServerStatsHandle {
  refresh: () => void;
}

const HISTORY_LEN = 20;
/** Widgets the phone can fill by itself. The rest need the server's collectors. */
export const LOCAL_WIDGETS: WidgetType[] = [
  "cpu",
  "memory",
  "disk",
  "network",
  "uptime",
  "processes",
  "system",
];

export function parseConfig(raw?: string): StatsConfig {
  try {
    return raw
      ? { ...DEFAULT_STATS_CONFIG, ...JSON.parse(raw) }
      : DEFAULT_STATS_CONFIG;
  } catch {
    return DEFAULT_STATS_CONFIG;
  }
}

const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/** What a metrics source hands the view. */
interface MetricsFeed {
  metrics: ServerMetrics | null;
  status: "loading" | "ready" | "error";
  error: string;
  refresh: () => Promise<void>;
  retry: () => void;
  history: (range: HistoryRange) => Promise<MetricPoint[]>;
}

/** Host metrics: sampled by the phone over SSH, or read from the server's plugin. */
export const ServerStats = forwardRef<ServerStatsHandle, ServerStatsProps>(
  ({ host, isVisible, onClose }, ref) => {
    const { target, retry, switchOrigin } = useExecTarget(
      host,
      "stats",
      isVisible,
    );
    const refreshRef = useRef<() => void>(() => {});
    useImperativeHandle(ref, () => ({ refresh: () => refreshRef.current() }));
    if (!isVisible) return null;
    return (
      <ExecGate
        target={target}
        onRetry={() => void retry()}
        onSwitch={switchOrigin}
        onClose={onClose}
        local={(runner) => (
          <LocalStats host={host} runner={runner} refreshRef={refreshRef} />
        )}
        relay={(serverHost) => (
          <RelayStats host={serverHost} refreshRef={refreshRef} />
        )}
      />
    );
  },
);
ServerStats.displayName = "ServerStats";

const RANGE_MS: Record<HistoryRange, number> = {
  "1h": 3600_000,
  "6h": 6 * 3600_000,
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
};

function LocalStats({
  host,
  runner,
  refreshRef,
}: {
  host: SSHHost;
  runner: ExecRunner;
  refreshRef: React.MutableRefObject<() => void>;
}) {
  const repos = useSessionRepositories();
  const config = parseConfig(host.statsConfig);
  const [source] = useState(() =>
    createLocalMetrics(runner, {
      excludedMounts: host.pluginSettings?.["host-metrics"]?.excludedMounts as
        string[] | undefined,
    }),
  );
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [error, setError] = useState("");

  const sample = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await source.sample(signal);
        setMetrics(next.metrics);
        setError("");
        repos.metricSamples.append(host, next.point).catch(() => {});
      } catch (e) {
        if (signal?.aborted) return;
        setError(errorText(e, "Could not read metrics from this host"));
      }
    },
    [source, repos, host],
  );
  refreshRef.current = () => void sample();

  const interval = Math.max(3, Number(config.metricsInterval) || 5) * 1000;
  usePoll(sample, { intervalMs: interval });

  const feed: MetricsFeed = {
    metrics,
    status: metrics ? "ready" : error ? "error" : "loading",
    error,
    refresh: () => sample(),
    retry: () => void sample(),
    history: (range) =>
      repos.metricSamples.range(host, Date.now() - RANGE_MS[range]),
  };
  return (
    <MetricsView
      host={host}
      feed={feed}
      widgets={config.enabledWidgets.filter((w) => LOCAL_WIDGETS.includes(w))}
      subtitle="Host Metrics | this phone"
    />
  );
}

function RelayStats({
  host,
  refreshRef,
}: {
  host: SSHHost;
  refreshRef: React.MutableRefObject<() => void>;
}) {
  const client = useClient(useSessionAccountId());
  const config = parseConfig(host.statsConfig);
  const feed = useRelayMetrics(client, host.id);
  refreshRef.current = () => void feed.refresh();
  return (
    <MetricsView
      host={host}
      feed={feed}
      widgets={config.enabledWidgets}
      subtitle="Host Metrics"
      client={client}
    />
  );
}

/** The server's collector: start it, keep a viewer alive, read its samples. */
function useRelayMetrics(
  client: AccountClient | null,
  hostId: number,
): MetricsFeed {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const [run, setRun] = useState(0);
  /** Error from starting polling, surfaced only if no metrics ever arrive. */
  const startErrorRef = useRef<string | null>(null);
  const viewerRef = useRef<string | null>(null);
  const hasMetrics = useRef(false);

  const fetchMetrics = useCallback(async () => {
    if (!client) return;
    try {
      const data = await client.api.metrics.getServerMetricsById(hostId);
      if (data === null) {
        // Not ready yet. If starting failed outright it never will be.
        if (startErrorRef.current && !hasMetrics.current) {
          setError(startErrorRef.current);
          setStatus("error");
        }
        return;
      }
      startErrorRef.current = null;
      hasMetrics.current = true;
      setMetrics(data);
      setStatus("ready");
      setError("");
    } catch (e) {
      if (!hasMetrics.current) {
        setError(errorText(e, "Failed to load metrics"));
        setStatus("error");
      }
    }
  }, [client, hostId]);

  useEffect(() => {
    if (!client) {
      setError("This session has no server");
      setStatus("error");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await client.api.metrics.startMetricsPolling(hostId);
        if (res?.requiresTOTP) {
          setError("Two-factor required for this host's stats.");
          setStatus("error");
          return;
        }
        if (res?.viewerSessionId) viewerRef.current = res.viewerSessionId;
      } catch (e) {
        // The host may already be polling, so metrics can still arrive.
        startErrorRef.current = errorText(e, "Failed to start metrics");
      }
      if (!viewerRef.current && !cancelled) {
        const reg = await client.api.metrics
          .registerMetricsViewer(hostId)
          .catch(() => null);
        if (reg?.viewerSessionId) viewerRef.current = reg.viewerSessionId;
      }
      if (!cancelled) void fetchMetrics();
    })();
    return () => {
      cancelled = true;
      const vsid = viewerRef.current;
      viewerRef.current = null;
      if (vsid) {
        client.api.metrics.unregisterMetricsViewer(hostId, vsid);
        client.api.metrics.stopMetricsPolling(hostId, vsid);
      } else {
        client.api.metrics.stopMetricsPolling(hostId);
      }
    };
  }, [client, hostId, run, fetchMetrics]);

  usePoll(
    async () => {
      await fetchMetrics();
      if (viewerRef.current) {
        client?.api.metrics.sendMetricsHeartbeat(viewerRef.current);
      }
    },
    { intervalMs: 3000, enabled: status !== "error" },
  );

  const live = useLiveSample(client, hostId, status === "ready");

  return {
    metrics: mergeLive(metrics, live),
    status,
    error,
    refresh: fetchMetrics,
    retry: () => {
      setStatus("loading");
      setError("");
      startErrorRef.current = null;
      setRun((r) => r + 1);
    },
    history: async (range) => {
      if (!client) return [];
      const rows = await client.api.metrics.getMetricsHistory(hostId, range);
      return rows.map((r) => ({ ...r, rx: null, tx: null }));
    },
  };
}

/**
 * Polls the server's 1s live sample while metrics show, for per core CPU,
 * memory split, network rates and the live process list. Never overlaps.
 */
function useLiveSample(
  client: AccountClient | null,
  hostId: number,
  active: boolean,
): LiveSample | null {
  const [live, setLive] = useState<LiveSample | null>(null);
  useEffect(() => {
    if (!client || !active) return;
    let stopped = false;
    let errors = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let delay = LIVE_POLL_MS;
      try {
        const sample = (await client.api.metrics.getLiveSample(
          hostId,
        )) as LiveSample | null;
        if (stopped) return;
        if (!sample) return; // An older server: no live route.
        errors = 0;
        setLive(sample);
        delay = Math.max(LIVE_POLL_MS, (sample.minIntervalS ?? 0) * 1000);
      } catch (e) {
        if (stopped) return;
        setLive(null);
        const code = (e as { code?: string })?.code;
        if (code === "LIVE_DISABLED" || ++errors >= LIVE_MAX_ERRORS) {
          delay = LIVE_RETRY_MS;
        }
      }
      timer = setTimeout(() => void tick(), delay);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, hostId, active]);
  return live;
}

function MetricsView({
  host,
  feed,
  widgets,
  subtitle,
  client,
}: {
  host: SSHHost;
  feed: MetricsFeed;
  widgets: WidgetType[];
  subtitle: string;
  /** Quick actions run snippets on the server, so only relay views pass it. */
  client?: AccountClient | null;
}) {
  const color = useThemeColor();
  const [refreshing, setRefreshing] = useState(false);
  // Sparkline history for cpu, memory and disk.
  const historyRef = useRef({
    cpu: [] as number[],
    memory: [] as number[],
    disk: [] as number[],
    last: "",
  });
  const metrics = feed.metrics;
  if (metrics && metrics.lastChecked !== historyRef.current.last) {
    const h = historyRef.current;
    const add = (arr: number[], v: number | null | undefined) => {
      arr.push(v ?? 0);
      if (arr.length > HISTORY_LEN) arr.shift();
    };
    add(h.cpu, metrics.cpu?.percent);
    add(h.memory, metrics.memory?.percent);
    add(h.disk, metrics.disk?.percent);
    h.last = metrics.lastChecked;
  }

  const runQuickAction = useCallback(
    async (snippetId: number, name: string) => {
      if (!client) return;
      try {
        await client.api.snippets.executeSnippet(snippetId, host.id);
        toast.success(`Ran ${name}`);
      } catch (e) {
        toast.error(errorText(e, `Failed to run ${name}`));
      }
    },
    [client, host.id],
  );

  const has = (w: WidgetType) => widgets.includes(w);
  const h = historyRef.current;
  const quickActions = client ? host.quickActions : undefined;

  return (
    <SessionFrame
      title={host.name}
      subtitle={subtitle}
      status={feed.status}
      loadingLabel="Loading metrics..."
      errorMessage={feed.error}
      onRetry={feed.status === "error" ? feed.retry : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          padding: 12,
          gap: 10,
          paddingBottom: 24,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={color("muted-foreground")}
            colors={[color("muted-foreground")]}
            onRefresh={async () => {
              setRefreshing(true);
              await feed.refresh();
              setRefreshing(false);
            }}
          />
        }
      >
        {quickActions && quickActions.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {quickActions.map((qa) => (
              <Pressable
                key={qa.snippetId}
                onPress={() => runQuickAction(qa.snippetId, qa.name)}
                className="flex-row items-center gap-1.5 border border-accent-brand/40 bg-accent-brand/10 px-2.5 py-1.5 active:opacity-80"
              >
                <Zap size={12} color={color("accent-brand")} />
                <Text className="text-[11px] text-accent-text">{qa.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {metrics ? (
          <>
            {has("cpu") ? (
              <CpuWidget metrics={metrics} history={h.cpu} />
            ) : null}
            {has("memory") ? (
              <MemoryWidget metrics={metrics} history={h.memory} />
            ) : null}
            {has("disk") ? (
              <DiskWidget metrics={metrics} history={h.disk} />
            ) : null}
            {has("temperature") ? (
              <TemperatureWidget metrics={metrics} />
            ) : null}
            {has("gpu") ? <GpuWidget metrics={metrics} /> : null}
            <HistoryCard load={feed.history} />
            {has("network") ? <NetworkWidget metrics={metrics} /> : null}
            {has("uptime") ? <UptimeWidget metrics={metrics} /> : null}
            {has("processes") ? <ProcessesWidget metrics={metrics} /> : null}
            {has("ports") ? <PortsWidget metrics={metrics} /> : null}
            {has("login_stats") ? <LoginStatsWidget metrics={metrics} /> : null}
            {has("firewall") ? <FirewallWidget metrics={metrics} /> : null}
            {has("system") ? <SystemWidget metrics={metrics} /> : null}
          </>
        ) : null}
      </ScrollView>
    </SessionFrame>
  );
}
