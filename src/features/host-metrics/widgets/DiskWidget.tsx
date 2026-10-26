import { View } from "react-native";
import { HardDrive } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { WidgetCard, Meter, Stats } from "./WidgetCard";

export function DiskWidget({
  metrics,
  history,
}: {
  metrics: ServerMetrics;
  history?: number[];
}) {
  const color = useThemeColor();
  const disk = metrics.disk;
  const percent = Number(disk?.percent ?? 0);
  // The main mount is already the meter above.
  const others = (disk?.filesystems ?? []).filter(
    (fs) => fs.mount !== (disk?.mount ?? "/"),
  );

  return (
    <WidgetCard
      icon={<HardDrive size={15} color={color("accent-brand")} />}
      title={disk?.mount ? `Disk  ${disk.mount}` : "Disk"}
      trailing={
        <Text className="text-xs text-muted-foreground">
          {percent.toFixed(0)}%
        </Text>
      }
    >
      <Meter percent={percent} history={history} />
      <Stats
        items={[
          { label: "Used", value: disk?.usedHuman },
          { label: "Total", value: disk?.totalHuman },
          { label: "Free", value: disk?.availableHuman },
        ]}
      />
      {others.length ? (
        <View className="mt-3 gap-2.5 border-t border-border pt-2.5">
          {others.map((fs) => (
            <View key={`${fs.filesystem}-${fs.mount}`} className="gap-1">
              <View className="flex-row items-center gap-2">
                <Text
                  weight="medium"
                  className="min-w-0 flex-1 text-xs text-foreground"
                  numberOfLines={1}
                >
                  {fs.label || fs.mount}
                </Text>
                <Text className="text-meta text-muted-foreground">
                  {fs.usedHuman ?? "-"} / {fs.totalHuman ?? "-"}
                </Text>
              </View>
              <Meter percent={Number(fs.percent ?? 0)} thin />
            </View>
          ))}
        </View>
      ) : null}
    </WidgetCard>
  );
}
