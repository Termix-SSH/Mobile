import { MemoryStick } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { WidgetCard, Meter, Stats } from "./WidgetCard";
import { t } from "@/i18n";

const gib = (n: number | null | undefined) =>
  n == null ? null : `${Number(n).toFixed(1)} GiB`;

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
      title={t("hostMetrics.widgets.memoryWidget.memory")}
      trailing={
        <Text className="text-xs text-muted-foreground">
          {percent.toFixed(0)}%
        </Text>
      }
    >
      <Meter percent={percent} history={history} />
      <Stats
        items={[
          {
            label: t("hostMetrics.widgets.memoryWidget.used"),
            value: gib(mem?.usedGiB),
          },
          {
            label: t("hostMetrics.widgets.memoryWidget.total"),
            value: gib(mem?.totalGiB),
          },
          {
            label: t("hostMetrics.widgets.memoryWidget.cached"),
            value: gib(mem?.cachedGiB),
          },
          {
            label: t("hostMetrics.widgets.memoryWidget.free"),
            value: gib(mem?.freeGiB),
          },
        ]}
      />
    </WidgetCard>
  );
}
