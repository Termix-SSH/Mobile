import { Cpu } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { WidgetCard, Meter } from "./WidgetCard";

export function CpuWidget({
  metrics,
  history,
}: {
  metrics: ServerMetrics;
  history?: number[];
}) {
  const color = useThemeColor();
  const cpu = metrics.cpu;
  const percent = Number(cpu?.percent ?? 0);

  return (
    <WidgetCard
      icon={<Cpu size={15} color={color("accent-brand")} />}
      title="CPU"
      trailing={
        <Text className="text-xs text-muted-foreground">
          {percent.toFixed(0)}%
        </Text>
      }
    >
      <Meter percent={percent} history={history} />
      {cpu?.cores != null ? (
        <Text className="text-[10px] text-muted-foreground mt-1.5">
          {cpu.cores} cores
          {cpu.load
            ? ` · load ${cpu.load.map((l) => Number(l).toFixed(2)).join(", ")}`
            : ""}
        </Text>
      ) : null}
    </WidgetCard>
  );
}
