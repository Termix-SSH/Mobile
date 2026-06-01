import { View } from "react-native";
import { Network } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { WidgetCard } from "./WidgetCard";

export function NetworkWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const interfaces = metrics.network?.interfaces ?? [];

  return (
    <WidgetCard
      icon={<Network size={15} color={color("accent-brand")} />}
      title="Network"
    >
      {interfaces.length === 0 ? (
        <Text className="text-[11px] text-muted-foreground">
          No interfaces
        </Text>
      ) : (
        <View className="gap-2">
          {interfaces.map((iface) => {
            const up = (iface.state || "").toUpperCase() === "UP";
            return (
              <View
                key={iface.name}
                className="flex-row items-center gap-2"
              >
                <View
                  style={{ backgroundColor: up ? "#22c55e" : "#ef4444" }}
                  className="w-2 h-2 rounded-full"
                />
                <View className="flex-1 min-w-0">
                  <Text
                    weight="medium"
                    className="text-[12px] text-foreground"
                    numberOfLines={1}
                  >
                    {iface.name}
                    {iface.ip ? (
                      <Text className="text-[11px] text-muted-foreground">
                        {"  "}
                        {iface.ip}
                      </Text>
                    ) : null}
                  </Text>
                </View>
                {iface.rx != null || iface.tx != null || iface.rxBytes != null || iface.txBytes != null ? (
                  <Text className="text-[10px] text-muted-foreground">
                    ↓ {iface.rx ?? iface.rxBytes ?? "—"} ↑ {iface.tx ?? iface.txBytes ?? "—"}
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
