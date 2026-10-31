import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { accounts, activeClient, api } from "@/core/accounts";
import { useRepositories } from "@/core/data/hooks";
import { useLocalStatuses } from "@/core/status";
import { hostStatusesByLocalId, isSynced } from "@/core/sync";
import type { HostMetrics } from "@/screens/hosts/navigation/Host";
import type { HostStatus } from "@/screens/hosts/navigation/hostTree";
import type { ServerStatus, Snippet, SSHHost } from "@/types";
import { publishHostSnapshot } from "@/widgets";
import { mapSettled } from "@/utils/limit";
import { toast } from "@/utils/toast";

export interface ServerAlert {
  id: string;
  title: string;
  message: string;
}

/**
 * Hosts with their folders, statuses, metrics and server notices for the
 * Hosts screen. Follows the store and keeps the home screen widgets current.
 */
export function useHostsData() {
  const repos = useRepositories();
  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const [folderColors, setFolderColors] = useState<
    Record<string, string | undefined>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<ServerAlert[]>([]);
  const [serverStatuses, setServerStatuses] = useState<
    Record<number, ServerStatus>
  >({});
  const [metrics, setMetrics] = useState<Record<number, HostMetrics>>({});
  // Snippets are fetched here only for the home screen widget. `null` means
  // not fetched yet, so a failed fetch never wipes what the widget has.
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const isRefreshingRef = useRef(false);

  // The phone checks hosts itself when no server reports status.
  const statusClient = activeClient();
  const phoneStatuses = useLocalStatuses(
    hosts,
    !statusClient || !statusClient.supports({ plugin: "host-status" }),
  );

  const getHostStatus = useCallback(
    (hostId: number): HostStatus =>
      serverStatuses[hostId]?.status ?? phoneStatuses[hostId] ?? "unknown",
    [serverStatuses, phoneStatuses],
  );

  // CPU and RAM for online hosts. Failures are ignored so the list renders.
  const fetchMetrics = useCallback(
    async (hostList: SSHHost[], statuses: Record<number, ServerStatus>) => {
      if (!activeClient()) return;
      // A synced copy has its own ids; metrics are asked by the server's.
      const synced = isSynced(accounts.active().id);
      const online = hostList.filter(
        (h) =>
          statuses[h.id]?.status === "online" &&
          (!synced || typeof h.serverId === "number"),
      );
      const onlineIds = online.map((h) => h.id);
      if (onlineIds.length === 0) {
        setMetrics((previous) =>
          Object.keys(previous).length === 0 ? previous : {},
        );
        return;
      }
      // A few at a time, so hundreds of online hosts don't flood the server.
      const results = await mapSettled(online, 6, (h) =>
        activeClient()!.api.metrics.getServerMetricsById(
          synced ? h.serverId! : h.id,
        ),
      );
      setMetrics((previous) => {
        const next: Record<number, HostMetrics> = {};
        results.forEach((res, i) => {
          const id = onlineIds[i];
          if (res.status === "fulfilled" && res.value) {
            next[id] = {
              cpu: res.value.cpu?.percent ?? null,
              ram: res.value.memory?.percent ?? null,
            };
          } else if (previous[id]) {
            // The server only reports once collection runs, so keep the last reading.
            next[id] = previous[id];
          }
        });
        return next;
      });
    },
    [],
  );

  // "quiet" reloads after a change without showing a spinner.
  const fetchData = useCallback(
    async (mode: boolean | "quiet" = false) => {
      if (isRefreshingRef.current) return;
      try {
        isRefreshingRef.current = true;
        if (mode === true) setRefreshing(true);
        else if (mode !== "quiet") setLoading(true);

        const client = activeClient();
        const [hostsResult, snippetsResult] = await Promise.allSettled([
          repos.hosts.list(),
          repos.snippets.list(),
        ]);
        if (hostsResult.status !== "fulfilled") throw hostsResult.reason;

        const raw = hostsResult.value as unknown;
        const hostList: SSHHost[] = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { hosts?: SSHHost[] })?.hosts)
            ? (raw as { hosts: SSHHost[] }).hosts
            : [];
        const statuses: Record<number, ServerStatus> = client
          ? await hostStatusesByLocalId<ServerStatus>(
              accounts.active().id,
              hostList,
            ).catch(() => ({}))
          : {};

        const colors: Record<string, string | undefined> = {};
        try {
          (await repos.hostFolders.list()).forEach((f) => {
            colors[f.name] = f.color;
          });
        } catch {
          // folders are optional
        }

        setHosts(hostList);
        setFolderColors(colors);
        setServerStatuses(statuses);
        if (
          snippetsResult.status === "fulfilled" &&
          Array.isArray(snippetsResult.value)
        ) {
          setSnippets(snippetsResult.value as Snippet[]);
        }
        void fetchMetrics(hostList, statuses);
      } catch (error: any) {
        const isAuth =
          error?.response?.status === 401 ||
          error?.code === "APP_LOCKED" ||
          error?.message?.includes("Authentication required");
        if (!isAuth) toast.error(error?.message || "Failed to load hosts.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        isRefreshingRef.current = false;
      }
    },
    [fetchMetrics, repos],
  );

  // Lists follow the store: sync and other screens write, this reloads.
  useEffect(() => {
    const reload = () => void fetchData("quiet");
    const stops = [
      repos.hosts.subscribe(reload),
      repos.hostFolders.subscribe(reload),
      repos.snippets.subscribe(reload),
    ];
    return () => stops.forEach((stop) => stop());
  }, [repos, fetchData]);

  // Server notices (maintenance, warnings) shown until dismissed.
  const loadAlerts = useCallback(async () => {
    const client = activeClient();
    if (!client) {
      setAlerts([]);
      return;
    }
    try {
      const res = await client.api.alerts.getUserAlerts();
      setAlerts(Array.isArray(res?.alerts) ? res.alerts : []);
    } catch {
      setAlerts([]);
    }
  }, []);

  const dismissAlert = useCallback(async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await api().alerts.dismissAlert(id);
    } catch {
      // Comes back on the next fetch if this fails.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      loadAlerts();
    }, [fetchData, loadAlerts]),
  );

  // Keep the home screen widgets in step with this list. The publisher
  // throttles and de-dupes, so running on every change is cheap.
  useEffect(() => {
    if (loading) return;
    // Phone checks fill in for hosts the server does not report on, so the
    // widgets work with no server at all.
    const statuses: Record<number, ServerStatus> = { ...serverStatuses };
    const checked = new Date().toISOString();
    for (const host of hosts) {
      const phone = phoneStatuses[host.id];
      if (!statuses[host.id] && phone) {
        statuses[host.id] = {
          status: phone,
          lastChecked: checked,
        };
      }
    }
    void publishHostSnapshot({
      hosts,
      statuses,
      metrics,
      snippets: snippets ?? undefined,
      serverUrl: activeClient()?.serverUrl ?? null,
      authenticated: true,
    });
  }, [loading, hosts, serverStatuses, phoneStatuses, metrics, snippets]);

  const refresh = useCallback(() => {
    if (isRefreshingRef.current) return;
    void activeClient()?.refreshEnabledPlugins();
    void fetchData(true);
  }, [fetchData]);

  return {
    repos,
    hosts,
    folderColors,
    loading,
    refreshing,
    alerts,
    dismissAlert,
    metrics,
    getHostStatus,
    refresh,
  };
}
