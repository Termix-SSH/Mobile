import { View } from "react-native";
import { Thermometer } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { WidgetCard, Meter } from "./WidgetCard";

// Most CPUs throttle near 100 C, so the bar fills toward that.
const HOT = 100;

export function TemperatureWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const temp = metrics.temperature;
  const sensors = [...(temp?.sensors ?? [])].sort(
    (a, b) => b.celsius - a.celsius,
  );
  if (!temp || temp.source === "none" || !sensors.length) return null;
  const highest = temp.highestCelsius ?? sensors[0].celsius;

  return (
    <WidgetCard
      icon={<Thermometer size={15} color={color("accent-brand")} />}
      title="Temperature"
      trailing={
        <Text className="text-xs text-muted-foreground">
          {highest.toFixed(0)} °C
        </Text>
      }
    >
      <View className="gap-2">
        {sensors.slice(0, 8).map((s) => (
          <View key={s.label} className="gap-1">
            <View className="flex-row items-center gap-2">
              <Text
                className="min-w-0 flex-1 text-xs text-foreground"
                numberOfLines={1}
              >
                {s.label}
              </Text>
              <Text className="text-meta text-muted-foreground">
                {s.celsius.toFixed(0)} °C
              </Text>
            </View>
            <Meter percent={(s.celsius / HOT) * 100} thin />
          </View>
        ))}
      </View>
    </WidgetCard>
  );
}
