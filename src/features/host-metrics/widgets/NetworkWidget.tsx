import { View } from "react-native";
import { Network } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { WidgetCard } from "./WidgetCard";

/** Bytes per second as a short rate, like 1.2 MB/s. */
export function formatRate(bps: number): string {
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let n = bps;
  let u = 0;
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000;
    u++;
  }
  return `${n >= 100 || u === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[u]}`;
}

export function NetworkWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const interfaces = metrics.network?.interfaces ?? [];

  return (
    <WidgetCard
      icon={<Network size={15} color={color("accent-brand")} />}
      title="Network"
    >
      {interfaces.length === 0 ? (
        <Text className="text-meta text-muted-foreground">No interfaces</Text>
      ) : (
        <View className="gap-2">
          {interfaces.map((iface) => {
            const up = (iface.state || "").toUpperCase() === "UP";
            const live = iface.rxRateBps != null || iface.txRateBps != null;
            const rx = live
              ? formatRate(iface.rxRateBps ?? 0)
              : (iface.rx ?? iface.rxBytes);
            const tx = live
              ? formatRate(iface.txRateBps ?? 0)
              : (iface.tx ?? iface.txBytes);
            return (
              <View key={iface.name} className="flex-row items-center gap-2">
                <View
                  style={{
                    backgroundColor: up
                      ? color("success")
                      : color("destructive"),
                  }}
                  className="h-2 w-2 rounded-full"
                  accessibilityLabel={up ? "Up" : "Down"}
                />
                <View className="min-w-0 flex-1">
                  <Text
                    weight="medium"
                    className="text-xs text-foreground"
                    numberOfLines={1}
                  >
                    {iface.name}
                  </Text>
                  {iface.ip ? (
                    <Text
                      className="text-meta text-muted-foreground"
                      numberOfLines={1}
                    >
                      {iface.ip}
                    </Text>
                  ) : null}
                </View>
                {rx != null || tx != null ? (
                  <Text className="text-meta text-muted-foreground">
                    ↓ {rx ?? "-"} | ↑ {tx ?? "-"}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </WidgetCard>
  );
}
