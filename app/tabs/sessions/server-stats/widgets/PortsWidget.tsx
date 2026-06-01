import { View } from "react-native";
import { Plug } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { MONO_FONT } from "@/app/constants/fonts";
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
        <Text className="text-[11px] text-muted-foreground">
          No listening ports
        </Text>
      ) : (
        <View className="gap-1">
          {ports.slice(0, 20).map((p, i) => (
            <View key={`${p.localPort}-${p.protocol}-${i}`} className="flex-row gap-2">
              <Text
                className="text-[10px] text-foreground w-16"
                style={{ fontFamily: MONO_FONT }}
              >
                {p.protocol}/{p.localPort}
              </Text>
              <Text
                className="text-[10px] text-muted-foreground flex-1"
                numberOfLines={1}
                style={{ fontFamily: MONO_FONT }}
              >
                {p.process || p.pid || "—"}
                {p.localAddress ? `  ${p.localAddress}` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
}
