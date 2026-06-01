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
import { ServerMetrics } from "@/types";
import {
  getServerMetricsById,
  startMetricsPolling,
  stopMetricsPolling,
  registerMetricsViewer,
  unregisterMetricsViewer,
  sendMetricsHeartbeat,
  executeSnippet,
} from "@/app/main-axios";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
import { SessionFrame, usePolling } from "@/app/tabs/sessions/_shared";
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
} from "./widgets";

interface ServerStatsProps {
  hostConfig: {
    id: number;
    name: string;
    statsConfig?: string;
    quickActions?: { name: string; snippetId: number }[];
  };
  isVisible: boolean;
  title?: string;
  onClose?: () => void;
}

export interface ServerStatsHandle {
  refresh: () => void;
}

const HISTORY_LEN = 20;

function parseConfig(raw?: string): StatsConfig {
  try {
    return raw ? { ...DEFAULT_STATS_CONFIG, ...JSON.parse(raw) } : DEFAULT_STATS_CONFIG;
  } catch {
    return DEFAULT_STATS_CONFIG;
  }
}

export const ServerStats = forwardRef<ServerStatsHandle, ServerStatsProps>(
  ({ hostConfig, isVisible }, ref) => {
    const color = useThemeColor();
    const config = parseConfig(hostConfig.statsConfig);
    const enabled = config.enabledWidgets;

    const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">(
      "loading",
    );
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const startedRef = useRef(false);
    const viewerSessionIdRef = useRef<string | null>(null);

    // Sparkline history for cpu/memory/disk.
    const historyRef = useRef<{ cpu: number[]; memory: number[]; disk: number[] }>(
      { cpu: [], memory: [], disk: [] },
    );
    const [, forceTick] = useState(0);

    const pushHistory = useCallback((m: ServerMetrics) => {
      const h = historyRef.current;
      const add = (arr: number[], v: number | null | undefined) => {
        arr.push(v ?? 0);
        if (arr.length > HISTORY_LEN) arr.shift();
      };
      add(h.cpu, m.cpu?.percent);
      add(h.memory, m.memory?.percent);
      add(h.disk, m.disk?.percent);
    }, []);

    const fetchMetrics = useCallback(async () => {
      try {
        const data = await getServerMetricsById(hostConfig.id);
        if (data === null) return; // Not ready yet — keep polling silently.
        setMetrics(data);
        pushHistory(data);
        setStatus("ready");
        setError("");
        forceTick((t) => t + 1);
      } catch (err: any) {
        if (!metrics) {
          setError(err?.message || "Failed to load metrics");
          setStatus("error");
        }
      }
    }, [hostConfig.id, pushHistory, metrics]);

    // Start polling + register viewer when the screen becomes visible.
    useEffect(() => {
      if (!isVisible || startedRef.current) return;
      startedRef.current = true;
      (async () => {
        try {
          const res = await startMetricsPolling(hostConfig.id);
          if (res?.requiresTOTP) {
            // Stats TOTP is rare; surface as an error with retry for now.
            setError("Two-factor required for this host's stats.");
            setStatus("error");
            return;
          }
          if (res?.viewerSessionId) {
            viewerSessionIdRef.current = res.viewerSessionId;
          }
        } catch {
          // Non-fatal — metrics endpoint may already be polling.
        }
        // If start didn't return a viewerSessionId, register separately.
        if (!viewerSessionIdRef.current) {
          const reg = await registerMetricsViewer(hostConfig.id);
          if (reg?.viewerSessionId) {
            viewerSessionIdRef.current = reg.viewerSessionId;
          }
        }
        fetchMetrics();
      })();
      return () => {
        startedRef.current = false;
        const vsid = viewerSessionIdRef.current;
        viewerSessionIdRef.current = null;
        if (vsid) {
          unregisterMetricsViewer(hostConfig.id, vsid);
          stopMetricsPolling(hostConfig.id, vsid);
        } else {
          stopMetricsPolling(hostConfig.id);
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible, hostConfig.id]);

    // Poll metrics + heartbeat while visible.
    usePolling(
      () => {
        fetchMetrics();
        if (viewerSessionIdRef.current) {
          sendMetricsHeartbeat(viewerSessionIdRef.current);
        }
      },
      3000,
      isVisible && status !== "error",
    );

    useImperativeHandle(ref, () => ({ refresh: fetchMetrics }), [fetchMetrics]);

    const runQuickAction = useCallback(
      async (snippetId: number, name: string) => {
        try {
          await executeSnippet(snippetId, hostConfig.id);
          toast.success(`Ran ${name}`);
        } catch (e: any) {
          toast.error(e?.message || `Failed to run ${name}`);
        }
      },
      [hostConfig.id],
    );

    if (!isVisible) return null;

    const has = (w: WidgetType) => enabled.includes(w);
    const h = historyRef.current;

    return (
      <SessionFrame
        title={hostConfig.name}
        subtitle="Server Stats"
        status={status === "ready" ? "ready" : status}
        loadingLabel="Loading metrics…"
        errorMessage={error}
        onRetry={
          status === "error"
            ? () => {
                setStatus("loading");
                startedRef.current = false;
                fetchMetrics();
              }
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={color("accent-brand")}
              onRefresh={async () => {
                setRefreshing(true);
                await fetchMetrics();
                setRefreshing(false);
              }}
            />
          }
        >
          {/* Quick actions */}
          {hostConfig.quickActions && hostConfig.quickActions.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {hostConfig.quickActions.map((qa) => (
                <Pressable
                  key={qa.snippetId}
                  onPress={() => runQuickAction(qa.snippetId, qa.name)}
                  className="flex-row items-center gap-1.5 px-2.5 py-1.5 border border-accent-brand/40 bg-accent-brand/10 active:opacity-80"
                >
                  <Zap size={12} color={color("accent-brand")} />
                  <Text className="text-[11px] text-accent-brand">
                    {qa.name}
                  </Text>
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
              {has("network") ? <NetworkWidget metrics={metrics} /> : null}
              {has("uptime") ? <UptimeWidget metrics={metrics} /> : null}
              {has("processes") ? <ProcessesWidget metrics={metrics} /> : null}
              {has("ports") ? <PortsWidget metrics={metrics} /> : null}
              {has("login_stats") ? (
                <LoginStatsWidget metrics={metrics} />
              ) : null}
              {has("firewall") ? <FirewallWidget metrics={metrics} /> : null}
              {has("system") ? <SystemWidget metrics={metrics} /> : null}
            </>
          ) : null}
        </ScrollView>
      </SessionFrame>
    );
  },
);

ServerStats.displayName = "ServerStats";
