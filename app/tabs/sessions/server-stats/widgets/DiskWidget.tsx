import { HardDrive } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { WidgetCard, Meter } from "./WidgetCard";

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

  return (
    <WidgetCard
      icon={<HardDrive size={15} color={color("accent-brand")} />}
      title="Disk"
      trailing={
        <Text className="text-xs text-muted-foreground">
          {percent.toFixed(0)}%
        </Text>
      }
    >
      <Meter percent={percent} history={history} />
      {disk?.usedHuman && disk?.totalHuman ? (
        <Text className="text-[10px] text-muted-foreground mt-1.5">
          {disk.usedHuman} / {disk.totalHuman}
          {disk.availableHuman ? ` · ${disk.availableHuman} free` : ""}
        </Text>
      ) : null}
    </WidgetCard>
  );
}
