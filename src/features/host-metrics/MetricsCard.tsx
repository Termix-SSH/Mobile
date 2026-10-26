import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { Activity } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { accounts, useClient } from "@/core/accounts";
import { repositoriesFor } from "@/core/data/repositories";
import { useCardTarget, usePoll } from "@/core/exec";
import type { DashboardCardProps } from "@/core/features/types";
import { CardFrame } from "@/screens/home/CardFrame";
import { Text } from "@/ui";
import { createLocalMetrics } from "./backend/local";
import { Sparkline } from "./widgets/WidgetCard";

interface Reading {
  cpu: number | null;
  memory: number | null;
  disk: number | null;
}

const errorText = (e: unknown) =>
  e instanceof Error && e.message ? e.message : "Could not read metrics";

/** CPU, memory and disk of a pinned host, with the last hour of CPU. */
export function MetricsCard({ host, accountId, active }: DashboardCardProps) {
  const target = useCardTarget(host, accountId, "stats", active);
  const client = useClient(accountId);
  const color = useThemeColor();
  const [reading, setReading] = useState<Reading | null>(null);
  const [cpuHour, setCpuHour] = useState<number[]>([]);
  const [error, setError] = useState("");
  const repos = useMemo(() => {
    const account = accounts.find(accountId ?? "") ?? accounts.active();
    return repositoriesFor(account, client);
  }, [accountId, client]);
  const local = useMemo(
    () => (target.phase === "local" ? createLocalMetrics(target.runner) : null),
    [target],
  );

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        if (local) {
          const { metrics, point } = await local.sample(signal);
          setReading({
            cpu: metrics.cpu.percent,
            memory: metrics.memory.percent,
            disk: metrics.disk.percent,
          });
          await repos.metricSamples.append(host, point).catch(() => {});
          const hour = await repos.metricSamples.range(
            host,
            Date.now() - 3600_000,
          );
          setCpuHour(hour.map((p) => p.cpu ?? 0));
        } else if (target.phase === "relay" && client) {
          // Only what the server already collects; a card never starts polling.
          const all = await client.api.metrics.getMetricsSummary();
          const mine = all.find((s) => s.hostId === target.host.id);
          if (!mine)
            throw new Error(
              "No recent sample. Open the host's metrics to start one.",
            );
          setReading(mine);
        } else return;
        setError("");
      } catch (e) {
        if (!signal.aborted) setError(errorText(e));
      }
    },
    [local, target, client, repos, host],
  );
  usePoll(load, {
    intervalMs: 30_000,
    enabled: active && (target.phase === "local" || target.phase === "relay"),
  });

  return (
    <CardFrame
      title="Metrics"
      icon={Activity}
      target={target}
      error={error}
      loading={!reading && !error}
    >
      {reading ? (
        <View className="gap-2">
          <View className="flex-row gap-4">
            <Value label="CPU" value={reading.cpu} />
            <Value label="Memory" value={reading.memory} />
            <Value label="Disk" value={reading.disk} />
          </View>
          {cpuHour.length > 1 ? (
            <Sparkline
              data={cpuHour.slice(-60)}
              stroke={color("accent-brand")}
              max={100}
              height={20}
            />
          ) : null}
        </View>
      ) : null}
    </CardFrame>
  );
}

function Value({ label, value }: { label: string; value: number | null }) {
  const tone =
    value === null
      ? "text-muted-foreground"
      : value >= 90
        ? "text-destructive-text"
        : "text-foreground";
  return (
    <View>
      <Text weight="bold" className={`text-lg ${tone}`}>
        {value === null ? "-" : `${Math.round(value)}%`}
      </Text>
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
    </View>
  );
}
