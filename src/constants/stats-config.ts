/**
 * Server-stats widget configuration. Mirrors the web `src/types/stats-widgets`.
 * `enabledWidgets` controls which widgets the mobile ServerStats screen renders;
 * it is persisted per host in `SSHHost.statsConfig` (JSON).
 */
export type WidgetType =
  | "cpu"
  | "memory"
  | "disk"
  | "network"
  | "uptime"
  | "processes"
  | "system"
  | "login_stats"
  | "ports"
  | "firewall"
  | "temperature"
  | "gpu";

export interface StatsConfig {
  enabledWidgets: WidgetType[];
  statusCheckEnabled?: boolean;
  statusCheckInterval?: number;
  metricsEnabled?: boolean;
  metricsInterval?: number;
}

export const ALL_WIDGETS: WidgetType[] = [
  "cpu",
  "memory",
  "disk",
  "network",
  "uptime",
  "system",
  "processes",
  "ports",
  "login_stats",
  "firewall",
  "temperature",
  "gpu",
];

export const DEFAULT_STATS_CONFIG: StatsConfig = {
  enabledWidgets: ALL_WIDGETS,
  statusCheckEnabled: true,
  statusCheckInterval: 30,
  metricsEnabled: true,
  metricsInterval: 30,
};
