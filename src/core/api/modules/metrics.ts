import type { AccountClient } from "../AccountClient";
import { statsLogger } from "@/core/log/logger";
import type {
  ServerStatus,
  ServerMetrics,
  LoginStatsMetrics,
} from "@/types/index";

export function createMetricsApi(c: AccountClient) {
  // 2.9 adds "reachable" (port answers, login failed). The UI only knows
  // online/offline, so it counts as online and keeps the raw value.
  function normalizeStatus(entry: any): ServerStatus {
    if (!entry || typeof entry !== "object") return entry;
    if (entry.status === "reachable") {
      return { ...entry, status: "online", rawStatus: "reachable" };
    }
    return entry;
  }

  function normalizeStatusMap(data: any): Record<number, ServerStatus> {
    const out: Record<number, ServerStatus> = {};
    if (!data || typeof data !== "object") return out;
    for (const [id, entry] of Object.entries(data)) {
      out[Number(id)] = normalizeStatus(entry);
    }
    return out;
  }

  async function getAllServerStatuses(): Promise<Record<number, ServerStatus>> {
    try {
      const response = await c.http.stats.get("/status");
      return normalizeStatusMap(response.data);
    } catch (error: any) {
      if (error?.response?.status === 404 && c.apiGeneration === "legacy") {
        try {
          const alt = c.rawAxios({
            baseURL: c.rootBase(),
            headers: { "Content-Type": "application/json" },
          });
          const response = await alt.get("/status");
          return response.data || {};
        } catch (e) {
          c.fail(e, "fetch server statuses");
        }
      }
      c.fail(error, "fetch server statuses");
    }
  }

  async function getServerStatusById(id: number): Promise<ServerStatus> {
    try {
      const response = await c.http.stats.get(`/status/${id}`);
      return normalizeStatus(response.data);
    } catch (error: any) {
      if (error?.response?.status === 404 && c.apiGeneration === "legacy") {
        try {
          const alt = c.rawAxios({
            baseURL: c.rootBase(),
            headers: { "Content-Type": "application/json" },
          });
          const response = await alt.get(`/status/${id}`);
          return response.data;
        } catch (e) {
          c.fail(e, "fetch server status");
        }
      }
      c.fail(error, "fetch server status");
    }
  }

  function normalizeMetrics(raw: any): ServerMetrics {
    // Processes: coerce cpu/mem strings → numbers (backend sends "2.5" not 2.5)
    let processes = raw.processes;
    if (processes?.top) {
      processes = {
        ...processes,
        top: processes.top.map((p: any) => ({
          ...p,
          cpu: Number(p.cpu) || 0,
          mem: Number(p.mem) || 0,
        })),
      };
    }

    // Network: map rxBytes/txBytes → rx/tx
    let network = raw.network;
    if (network?.interfaces) {
      network = {
        ...network,
        interfaces: network.interfaces.map((iface: any) => ({
          ...iface,
          rx: iface.rx ?? iface.rxBytes ?? null,
          tx: iface.tx ?? iface.txBytes ?? null,
        })),
      };
    }

    // Login stats: snake_case backend key → camelCase, map to correct shape
    const rawLogin = raw.login_stats ?? raw.loginStats;
    const loginStats: LoginStatsMetrics | undefined = rawLogin
      ? {
          recentLogins: Array.isArray(rawLogin.recentLogins)
            ? rawLogin.recentLogins
            : [],
          failedLogins: Array.isArray(rawLogin.failedLogins)
            ? rawLogin.failedLogins
            : [],
          totalLogins: rawLogin.totalLogins ?? 0,
          uniqueIPs: rawLogin.uniqueIPs ?? 0,
        }
      : undefined;

    return { ...raw, processes, network, loginStats } as ServerMetrics;
  }

  async function getServerMetricsById(
    id: number,
  ): Promise<ServerMetrics | null> {
    if (!c.isPluginEnabled("host-metrics")) return null;
    try {
      const response = await c.http.stats.get(`/metrics/${id}`);
      return response.data ? normalizeMetrics(response.data) : null;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        // Metrics not ready yet - backend is still starting collection.
        return null;
      }
      c.fail(error, "fetch server metrics");
    }
  }

  /**
   * The cheap 1s /proc sample (Host Metrics 1.1+). Throws with
   * `code: "LIVE_DISABLED"` when the admin turned it off.
   */
  async function getLiveSample(id: number): Promise<unknown> {
    if (!c.isPluginApi() || !c.isPluginEnabled("host-metrics")) return null;
    try {
      const response = await c.http.stats.get(
        `/plugin-api/host-metrics/host-metrics/managers/live/${id}`,
        { timeout: 10000 },
      );
      return response.data ?? null;
    } catch (error: any) {
      const code = error?.response?.data?.code;
      throw Object.assign(new Error("Live sample failed"), { code });
    }
  }

  /**
   * Start metrics collection for a host. Returns a viewerSessionId that must be
   * passed to heartbeat/stop/unregister calls. May return requiresTOTP for 2FA hosts.
   */
  async function startMetricsPolling(id: number): Promise<{
    success?: boolean;
    requiresTOTP?: boolean;
    sessionId?: string;
    viewerSessionId?: string;
  }> {
    try {
      const response = await c.http.stats.post(`/metrics/start/${id}`);
      const data = response.data || {};
      return { ...data, requiresTOTP: data.requiresTOTP ?? data.requires_totp };
    } catch (error) {
      c.fail(error, "start metrics polling");
    }
  }

  async function stopMetricsPolling(
    id: number,
    viewerSessionId?: string,
  ): Promise<void> {
    try {
      await c.http.stats.post(
        `/metrics/stop/${id}`,
        viewerSessionId ? { viewerSessionId } : undefined,
      );
    } catch {
      // Best-effort on teardown.
    }
  }

  async function submitMetricsTOTP(
    sessionId: string,
    totpCode: string,
  ): Promise<any> {
    try {
      const response = await c.http.stats.post("/metrics/connect-totp", {
        sessionId,
        totpCode,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "submit metrics TOTP");
    }
  }

  /** Register this viewer so the backend keeps polling while the screen is open. Returns a viewerSessionId. */
  async function registerMetricsViewer(id: number): Promise<{
    success?: boolean;
    viewerSessionId?: string;
    skipped?: boolean;
  }> {
    try {
      const response = await c.http.stats.post("/metrics/register-viewer", {
        hostId: id,
      });
      return response.data || {};
    } catch {
      // Best-effort.
      return {};
    }
  }

  async function unregisterMetricsViewer(
    id: number,
    viewerSessionId: string,
  ): Promise<void> {
    try {
      await c.http.stats.post("/metrics/unregister-viewer", {
        hostId: id,
        viewerSessionId,
      });
    } catch {
      // Best-effort on teardown.
    }
  }

  /** Heartbeat so the backend knows a viewer is still watching this host. */
  async function sendMetricsHeartbeat(viewerSessionId: string): Promise<void> {
    try {
      await c.http.stats.post("/metrics/heartbeat", { viewerSessionId });
    } catch {
      // Best-effort.
    }
  }

  async function refreshServerPolling(): Promise<void> {
    try {
      await c.http.stats.post("/refresh");
    } catch (error) {
      statsLogger.warn("Failed to refresh server polling", {
        operation: "refresh_polling",
      });
    }
  }

  async function notifyHostCreatedOrUpdated(hostId: number): Promise<void> {
    // 2.9 picks up host changes on its own.
    if (c.apiGeneration === "plugin") return;
    try {
      await c.http.stats.post("/host-updated", { hostId });
    } catch (error) {
      statsLogger.warn("Failed to notify stats server of host update", {
        operation: "notify_host_updated",
      });
    }
  }

  /** The server's saved history for a host, oldest first. */
  async function getMetricsHistory(
    id: number,
    range: "1h" | "6h" | "24h" | "7d",
  ): Promise<
    {
      ts: number;
      cpu: number | null;
      mem: number | null;
      disk: number | null;
    }[]
  > {
    try {
      const response = await c.http.stats.get(`/metrics/history/${id}`, {
        params: { range },
      });
      const rows: Record<string, unknown>[] = response.data?.rows ?? [];
      const num = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      return rows
        .map((row) => ({
          ts: parseServerTime(row.ts),
          cpu: num(row.cpu_percent),
          mem: num(row.mem_percent),
          disk: num(row.disk_percent),
        }))
        .filter((p) => Number.isFinite(p.ts));
    } catch (error) {
      c.fail(error, "fetch metrics history");
    }
  }

  /** The last sample of every host the server already watches. Starts nothing. */
  async function getMetricsSummary(): Promise<
    {
      hostId: number;
      cpu: number | null;
      memory: number | null;
      disk: number | null;
      lastChecked: string;
    }[]
  > {
    try {
      const response = await c.http.stats.get(`/metrics/summary`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      c.fail(error, "fetch metrics summary");
    }
  }

  return {
    getMetricsSummary,
    getMetricsHistory,
    getAllServerStatuses,
    getServerStatusById,
    getServerMetricsById,
    getLiveSample,
    startMetricsPolling,
    stopMetricsPolling,
    submitMetricsTOTP,
    registerMetricsViewer,
    unregisterMetricsViewer,
    sendMetricsHeartbeat,
    refreshServerPolling,
    notifyHostCreatedOrUpdated,
  };
}

export type MetricsApi = ReturnType<typeof createMetricsApi>;

/** Server timestamps come as "2026-10-24 12:00:00" in UTC, or ISO. */
export function parseServerTime(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  return Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`);
}
