import { useState } from "react";
import { Pressable, View } from "react-native";
import { Activity } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { MONO_FONT } from "@/constants/fonts";
import { WidgetCard } from "./WidgetCard";

type SortKey = "cpu" | "mem";

export function ProcessesWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const [sort, setSort] = useState<SortKey>("cpu");
  const proc = metrics.processes;
  const top = [...(proc?.top ?? [])]
    .sort((a, b) => b[sort] - a[sort])
    .slice(0, 8);

  const SortHead = ({ id, label }: { id: SortKey; label: string }) => (
    <Pressable
      onPress={() => setSort(id)}
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label}`}
      accessibilityState={{ selected: sort === id }}
      hitSlop={8}
      className="w-12"
    >
      <Text
        weight={sort === id ? "medium" : undefined}
        className={`text-2xs ${sort === id ? "text-accent-text" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <WidgetCard
      icon={<Activity size={15} color={color("accent-brand")} />}
      title="Processes"
      trailing={
        proc?.total != null ? (
          <Text className="text-xs text-muted-foreground">
            {proc.running ?? 0} running | {proc.total}
          </Text>
        ) : undefined
      }
    >
      {top.length === 0 ? (
        <Text className="text-meta text-muted-foreground">No process data</Text>
      ) : (
        <View className="gap-1">
          <View className="flex-row gap-2">
            <SortHead id="cpu" label="CPU%" />
            <SortHead id="mem" label="MEM%" />
            <Text className="flex-1 text-2xs text-muted-foreground">
              COMMAND
            </Text>
          </View>
          {top.map((p, i) => (
            <View key={`${p.pid}-${i}`} className="flex-row gap-2">
              <Text
                className="w-12 text-meta text-foreground"
                style={{ fontFamily: MONO_FONT }}
              >
                {p.cpu.toFixed(1)}
              </Text>
              <Text
                className="w-12 text-meta text-foreground"
                style={{ fontFamily: MONO_FONT }}
              >
                {p.mem.toFixed(1)}
              </Text>
              <Text
                className="flex-1 text-meta text-muted-foreground"
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
