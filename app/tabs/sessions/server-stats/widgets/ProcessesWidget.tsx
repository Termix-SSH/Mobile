import { View } from "react-native";
import { Activity } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { MONO_FONT } from "@/app/constants/fonts";
import { WidgetCard } from "./WidgetCard";

export function ProcessesWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const proc = metrics.processes;
  const top = (proc?.top ?? []).slice(0, 8);

  return (
    <WidgetCard
      icon={<Activity size={15} color={color("accent-brand")} />}
      title="Processes"
      trailing={
        proc?.total != null ? (
          <Text className="text-xs text-muted-foreground">
            {proc.running ?? 0}/{proc.total}
          </Text>
        ) : undefined
      }
    >
      {top.length === 0 ? (
        <Text className="text-[11px] text-muted-foreground">
          No process data
        </Text>
      ) : (
        <View className="gap-1">
          <View className="flex-row gap-2">
            <Text className="text-[9px] text-muted-foreground w-12">CPU%</Text>
            <Text className="text-[9px] text-muted-foreground w-12">MEM%</Text>
            <Text className="text-[9px] text-muted-foreground flex-1">
              COMMAND
            </Text>
          </View>
          {top.map((p, i) => (
            <View key={`${p.pid}-${i}`} className="flex-row gap-2">
              <Text
                className="text-[10px] text-foreground w-12"
                style={{ fontFamily: MONO_FONT }}
              >
                {p.cpu.toFixed(1)}
              </Text>
              <Text
                className="text-[10px] text-foreground w-12"
                style={{ fontFamily: MONO_FONT }}
              >
                {p.mem.toFixed(1)}
              </Text>
              <Text
                className="text-[10px] text-muted-foreground flex-1"
                numberOfLines={1}
                style={{ fontFamily: MONO_FONT }}
              >
                {p.command}
              </Text>
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
}
