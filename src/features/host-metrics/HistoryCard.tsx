import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { History } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { MetricPoint } from "@/core/data/types";
import { usePoll } from "@/core/exec";
import { Tabs, Text } from "@/ui";
import { Sparkline, WidgetCard } from "./widgets/WidgetCard";

export type HistoryRange = "1h" | "6h" | "24h" | "7d";

const BARS = 60;

/** Averages points into `bars` even time slices; empty slices are skipped. */
export function bucket(
  points: MetricPoint[],
  key: "cpu" | "mem" | "disk",
  bars = BARS,
): number[] {
  const values = points.filter((p) => p[key] !== null);
  if (values.length <= bars) return values.map((p) => p[key] as number);
  const first = values[0].ts;
  const span = Math.max(1, values[values.length - 1].ts - first);
  const sums = new Array<number>(bars).fill(0);
  const counts = new Array<number>(bars).fill(0);
  for (const p of values) {
    const i = Math.min(bars - 1, Math.floor(((p.ts - first) / span) * bars));
    sums[i] += p[key] as number;
    counts[i]++;
  }
  return sums.flatMap((sum, i) => (counts[i] ? [sum / counts[i]] : []));
}

export function summary(values: number[]): string {
  if (!values.length) return "No data yet";
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return `avg ${avg.toFixed(0)}% | max ${Math.max(...values).toFixed(0)}%`;
}

const SERIES = [
  { key: "cpu", label: "CPU" },
  { key: "mem", label: "Memory" },
  { key: "disk", label: "Disk" },
] as const;

function Poller({ run }: { run: () => Promise<void> }) {
  usePoll(run, { intervalMs: 60_000 });
  return null;
}

/** CPU, memory and disk over time, from what was saved. */
export function HistoryCard({
  load,
}: {
  load: (range: HistoryRange) => Promise<MetricPoint[]>;
}) {
  const color = useThemeColor();
  const [range, setRange] = useState<HistoryRange>("1h");
  const [points, setPoints] = useState<MetricPoint[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPoints(await load(range));
    } catch {
      setPoints([]);
    }
  }, [load, range]);

  useEffect(() => setPoints(null), [range]);

  const stroke = color("accent-brand");
  return (
    <WidgetCard
      icon={<History size={14} color={color("muted-foreground")} />}
      title="History"
    >
      {/* Keyed by range so a new range loads at once and polls from there. */}
      <Poller key={range} run={refresh} />
      <Tabs<HistoryRange>
        value={range}
        onChange={setRange}
        options={[
          { id: "1h", label: "1h" },
          { id: "6h", label: "6h" },
          { id: "24h", label: "24h" },
          { id: "7d", label: "7d" },
        ]}
      />
      <View className="mt-2 gap-3">
        {SERIES.map((s) => {
          const values = points ? bucket(points, s.key) : [];
          return (
            <View key={s.key} className="gap-1">
              <View className="flex-row justify-between">
                <Text className="text-[11px] text-muted-foreground">
                  {s.label}
                </Text>
                <Text className="text-[11px] text-muted-foreground">
                  {points ? summary(values) : "Loading..."}
                </Text>
              </View>
              <Sparkline data={values} stroke={stroke} max={100} height={32} />
            </View>
          );
        })}
      </View>
    </WidgetCard>
  );
}
