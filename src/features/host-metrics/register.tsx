import { forwardRef } from "react";
import { Activity, Server } from "lucide-react-native";
import type {
  FeatureDef,
  HostEditorSectionDef,
  HostFormTabProps,
  SessionTabProps,
} from "@/core/features/types";
import {
  DEFAULT_STATS_CONFIG,
  type StatsConfig,
} from "@/constants/stats-config";
import type { SSHHost } from "@/types";
import type { DataResult } from "@/core/data-values/data-value";
import { isSshHost } from "@/utils/hosts";
import { FakeSwitch, SettingRow } from "@/ui";
import { MetricsCard } from "./MetricsCard";
import { ServerStats, type ServerStatsHandle } from "./ServerStats";
import { t } from "@/i18n";

function statsConfig(host: SSHHost): StatsConfig {
  try {
    return host.statsConfig
      ? JSON.parse(host.statsConfig)
      : DEFAULT_STATS_CONFIG;
  } catch {
    return DEFAULT_STATS_CONFIG;
  }
}

/**
 * Off only when the host turned metrics off. Plugin settings with no
 * host-metrics entry mean a host on this phone, or a server without the
 * plugin; the phone can sample both. Older servers keep it in statsConfig.
 */
export function metricsAllowed(host: SSHHost): boolean {
  const settings = host.pluginSettings?.["host-metrics"];
  if (settings) return settings.metricsEnabled !== false;
  if (host.pluginSettings) return true;
  return statsConfig(host).metricsEnabled !== false;
}

const MetricsTab = forwardRef<ServerStatsHandle, SessionTabProps>(
  ({ session, isVisible, onClose }, ref) => (
    <ServerStats
      ref={ref}
      host={session.host}
      isVisible={isVisible}
      title={session.title}
      onClose={onClose}
    />
  ),
);
MetricsTab.displayName = "MetricsTab";

const metricsOn = (host: SSHHost) => isSshHost(host) && metricsAllowed(host);

function MetricsSettings({ value, onChange }: HostFormTabProps) {
  return (
    <SettingRow
      label={t("hostMetrics.register.enableMetrics")}
      description={t("hostMetrics.register.cpuMemoryDiskAndNetwork")}
      last
    >
      <FakeSwitch
        accessibilityLabel={t("hostMetrics.register.enableMetrics")}
        checked={value.metricsEnabled !== false}
        onChange={(metricsEnabled) => onChange({ metricsEnabled })}
      />
    </SettingRow>
  );
}

const metricsHostSection: HostEditorSectionDef = {
  id: "host-metrics",
  label: t("hostMetrics.register.hostMetrics"),
  icon: Activity,
  group: "ssh",
  order: 40,
  editor: {
    read: (host) => ({
      ...(host ? statsConfig(host) : DEFAULT_STATS_CONFIG),
      metricsEnabled: !host || metricsAllowed(host),
    }),
    write: (value, payload) => {
      payload.statsConfig = JSON.stringify(value);
    },
    component: MetricsSettings,
  },
};

/** CPU and RAM bars for a host row, as the web's dashboard row gets them. */
export function hostRowMetrics(
  host: SSHHost,
  metrics: { cpu: number | null; ram: number | null } | undefined,
): DataResult {
  if (!metrics || !metricsOn(host)) return null;
  const share = (percent: number | null) =>
    percent != null && percent > 0 ? Math.min(100, percent) / 100 : null;
  const items = [
    { label: t("hostMetrics.register.cpu"), value: share(metrics.cpu) },
    { label: t("hostMetrics.register.ram"), value: share(metrics.ram) },
  ].filter((item) => item.value !== null);
  return items.length > 0 ? { shape: "bars", items } : null;
}

export const hostMetricsFeature: FeatureDef = {
  id: "host-metrics",
  plugins: ["host-metrics"],
  title: t("hostMetrics.register.hostMetrics"),
  source: "native",
  // Sampled over the phone's SSH, or read from the server's plugin.
  availableOn: ["local", "server"],
  hostEditorSections: ({ account }) =>
    account.kind === "local" ? [metricsHostSection] : [],
  sessionTabs: [
    {
      type: "stats",
      icon: Activity,
      titleSuffix: () => "Metrics",
      shortLabel: () => "Metrics",
      needsOneOf: [["exec"], ["server"]],
      relayRequires: { plugin: "host-metrics" },
      serverTabTypes: ["host-metrics", "stats"],
      // 2.9+ web names this tab after its plugin.
      toServerTabType: (_s, client) =>
        client?.isPluginApi() ? "host-metrics" : "stats",
      capabilities: ["keyboard-cover"],
      component: MetricsTab,
    },
  ],
  dashboardCards: [
    {
      id: "host-metrics",
      title: t("hostMetrics.register.metrics"),
      order: 10,
      tabType: "stats",
      isAvailable: metricsOn,
      component: MetricsCard,
    },
  ],
  hostRowData: [{ id: "host-metrics.row", order: 10, value: hostRowMetrics }],
  hostActions: [
    {
      id: "host-metrics.open",
      label: t("hostMetrics.register.hostMetrics"),
      icon: Server,
      group: "connect",
      order: 50,
      isAvailable: metricsOn,
      run: (_host, ctx) => ctx.openSession("stats"),
    },
  ],
  tools: [
    {
      id: "host-metrics",
      label: t("hostMetrics.register.hostMetrics"),
      description: t("hostMetrics.register.cpuMemoryDiskAndNetwork2"),
      icon: Server,
      order: 50,
      tabType: "stats",
      isAvailable: metricsOn,
    },
  ],
};
