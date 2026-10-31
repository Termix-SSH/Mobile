import { View } from "react-native";
import { Plug } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { MONO_FONT } from "@/constants/fonts";
import { WidgetCard } from "./WidgetCard";

export function PortsWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const ports = metrics.ports?.ports ?? [];

  return (
    <WidgetCard
      icon={<Plug size={15} color={color("accent-brand")} />}
      title="Listening Ports"
      trailing={
        ports.length ? (
          <Text className="text-xs text-muted-foreground">{ports.length}</Text>
        ) : undefined
      }
    >
      {ports.length === 0 ? (
        <Text className="text-meta text-muted-foreground">
          No listening ports
        </Text>
      ) : (
        <View className="gap-1">
          {ports.slice(0, 20).map((p, i) => (
            <View
              key={`${p.localPort}-${p.protocol}-${i}`}
              className="flex-row gap-2"
            >
              <Text
                className="w-16 text-2xs text-foreground"
                style={{ fontFamily: MONO_FONT }}
              >
                {p.protocol}/{p.localPort}
              </Text>
              <Text
                className="flex-1 text-2xs text-muted-foreground"
                numberOfLines={1}
                style={{ fontFamily: MONO_FONT }}
              >
                {p.process || p.pid || "-"}
                {p.localAddress ? `  ${p.localAddress}` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
}
