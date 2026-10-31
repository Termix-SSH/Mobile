import { View } from "react-native";
import { Gpu } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { WidgetCard, Meter, Stats } from "./WidgetCard";

const num = (n: number | null, unit: string, digits = 0) =>
  n == null ? null : `${n.toFixed(digits)} ${unit}`;

export function GpuWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const gpu = metrics.gpu;
  if (!gpu || gpu.source === "none" || !gpu.gpus.length) return null;

  return (
    <WidgetCard
      icon={<Gpu size={15} color={color("accent-brand")} />}
      title={gpu.gpus.length > 1 ? `GPUs (${gpu.gpus.length})` : "GPU"}
    >
      <View className="gap-3">
        {gpu.gpus.map((g, i) => (
          <View
            key={g.uuid || g.index}
            className={i > 0 ? "border-t border-border pt-3" : ""}
          >
            <View className="mb-1.5 flex-row items-center gap-2">
              <Text
                weight="medium"
                className="min-w-0 flex-1 text-xs text-foreground"
                numberOfLines={1}
              >
                {g.name}
              </Text>
              <Text className="text-meta text-muted-foreground">
                {g.utilizationPercent == null
                  ? "-"
                  : `${g.utilizationPercent.toFixed(0)}%`}
              </Text>
            </View>
            <Meter percent={g.utilizationPercent ?? 0} />
            <Stats
              items={[
                {
                  label: "Memory",
                  value:
                    g.memoryUsedMiB != null && g.memoryTotalMiB != null
                      ? `${(g.memoryUsedMiB / 1024).toFixed(1)} / ${(g.memoryTotalMiB / 1024).toFixed(1)} GiB`
                      : null,
                },
                { label: "Temp", value: num(g.temperatureCelsius, "°C") },
                {
                  label: "Power",
                  value:
                    g.powerDrawWatts == null
                      ? null
                      : g.powerLimitWatts
                        ? `${g.powerDrawWatts.toFixed(0)} / ${g.powerLimitWatts.toFixed(0)} W`
                        : `${g.powerDrawWatts.toFixed(0)} W`,
                },
                { label: "Fan", value: num(g.fanPercent, "%") },
              ]}
            />
          </View>
        ))}
      </View>
    </WidgetCard>
  );
}
