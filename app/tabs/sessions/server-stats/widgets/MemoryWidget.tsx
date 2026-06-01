import { MemoryStick } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { WidgetCard, Meter } from "./WidgetCard";

export function MemoryWidget({
  metrics,
  history,
}: {
  metrics: ServerMetrics;
  history?: number[];
}) {
  const color = useThemeColor();
  const mem = metrics.memory;
  const percent = Number(mem?.percent ?? 0);

  return (
    <WidgetCard
      icon={<MemoryStick size={15} color={color("accent-brand")} />}
      title="Memory"
      trailing={
        <Text className="text-xs text-muted-foreground">
          {percent.toFixed(0)}%
        </Text>
      }
    >
      <Meter percent={percent} history={history} />
      {mem?.usedGiB != null && mem?.totalGiB != null ? (
        <Text className="text-[10px] text-muted-foreground mt-1.5">
          {Number(mem.usedGiB).toFixed(1)} / {Number(mem.totalGiB).toFixed(1)} GiB
        </Text>
      ) : null}
    </WidgetCard>
  );
}
