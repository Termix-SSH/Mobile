import { View } from "react-native";
import { Cpu } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { WidgetCard, Meter, Stats, useLevelColor } from "./WidgetCard";
import { t } from "@/i18n";

const pct = (n: number) => `${n.toFixed(0)}%`;

export function CpuWidget({
  metrics,
  history,
}: {
  metrics: ServerMetrics;
  history?: number[];
}) {
  const color = useThemeColor();
  const level = useLevelColor();
  const cpu = metrics.cpu;
  const percent = Number(cpu?.percent ?? 0);
  const perCore = (cpu?.perCore ?? []).map((n) => Number(n ?? 0));

  return (
    <WidgetCard
      icon={<Cpu size={15} color={color("accent-brand")} />}
      title={t("hostMetrics.widgets.cpuWidget.cpu")}
      trailing={
        <Text className="text-xs text-muted-foreground">{pct(percent)}</Text>
      }
    >
      <Meter percent={percent} history={history} />
      {perCore.length > 1 ? (
        <View
          className="mt-2 flex-row items-end gap-[2px]"
          style={{ height: 24 }}
          accessibilityLabel={t("hostMetrics.widgets.cpuWidget.perCore", {
            value: perCore.map(pct).join(", "),
          })}
        >
          {perCore.map((v, i) => (
            <View key={i} className="h-full flex-1 justify-end bg-muted">
              <View
                style={{
                  height: `${Math.max(2, Math.min(100, v))}%`,
                  backgroundColor: level(v),
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
      <Stats
        items={[
          {
            label: t("hostMetrics.widgets.cpuWidget.cores"),
            value: cpu?.cores != null ? String(cpu.cores) : null,
          },
          {
            label: t("hostMetrics.widgets.cpuWidget.load"),
            value: cpu?.load
              ? cpu.load.map((l) => Number(l).toFixed(2)).join("  ")
              : null,
          },
          {
            label: t("hostMetrics.widgets.cpuWidget.user"),
            value: cpu?.mix ? pct(cpu.mix.user) : null,
          },
          {
            label: t("hostMetrics.widgets.cpuWidget.system"),
            value: cpu?.mix ? pct(cpu.mix.system) : null,
          },
          {
            label: t("hostMetrics.widgets.cpuWidget.ioWait"),
            value: cpu?.mix ? pct(cpu.mix.iowait) : null,
          },
          {
            label: t("hostMetrics.widgets.cpuWidget.steal"),
            value: cpu?.mix && cpu.mix.steal > 0 ? pct(cpu.mix.steal) : null,
          },
        ]}
      />
    </WidgetCard>
  );
}
