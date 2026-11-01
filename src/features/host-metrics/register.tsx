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
import { isSshHost } from "@/utils/hosts";
import { FakeSwitch, SettingRow } from "@/ui";
import { MetricsCard } from "./MetricsCard";
import { ServerStats, type ServerStatsHandle } from "./ServerStats";

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
      label="Enable metrics"
      description="CPU, memory, disk and network over SSH"
      last
    >
      <FakeSwitch
        accessibilityLabel="Enable metrics"
        checked={value.metricsEnabled !== false}
        onChange={(metricsEnabled) => onChange({ metricsEnabled })}
      />
    </SettingRow>
  );
}

const metricsHostSection: HostEditorSectionDef = {
  id: "host-metrics",
  label: "Host Metrics",
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

export const hostMetricsFeature: FeatureDef = {
  id: "host-metrics",
  plugins: ["host-metrics"],
  title: "Host Metrics",
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
      title: "Metrics",
      order: 10,
      tabType: "stats",
      isAvailable: metricsOn,
      component: MetricsCard,
    },
  ],
  hostActions: [
    {
      id: "host-metrics.open",
      label: "Host Metrics",
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
      label: "Host Metrics",
      description: "CPU, memory, disk and network",
      icon: Server,
      order: 50,
      tabType: "stats",
      isAvailable: metricsOn,
    },
  ],
};
