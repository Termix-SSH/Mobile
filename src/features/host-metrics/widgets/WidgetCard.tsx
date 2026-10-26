import { View } from "react-native";
import { Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";

/** Shared card chrome for every stats widget: icon + title + optional trailing. */
export function WidgetCard({
  icon,
  title,
  trailing,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View className="border border-border bg-card p-3">
      <View className="mb-2 flex-row items-center gap-2">
        {icon}
        <Text weight="medium" className="text-sm text-foreground">
          {title}
        </Text>
        {trailing ? <View className="ml-auto">{trailing}</View> : null}
      </View>
      {children}
    </View>
  );
}

/** Brand under 70%, warning to 90%, destructive above, like the web cards. */
export function useLevelColor(): (percent: number) => string {
  const ui = useUiColors();
  return (pct) =>
    pct >= 90 ? ui.destructive : pct >= 70 ? ui.warning : ui.brand;
}

/** A labeled usage bar (CPU / memory / disk). */
export function Meter({
  percent,
  history,
  thin = false,
}: {
  percent: number;
  history?: number[];
  thin?: boolean;
}) {
  const level = useLevelColor();
  const pct = Math.max(0, Math.min(100, percent));
  const barColor = level(pct);
  return (
    <View className="gap-1.5">
      {history && history.length > 1 ? (
        <Sparkline data={history} stroke={barColor} max={100} />
      ) : null}
      <View className={`${thin ? "h-1" : "h-2"} overflow-hidden bg-muted`}>
        <View
          style={{ width: `${pct}%`, backgroundColor: barColor }}
          className="h-full"
        />
      </View>
    </View>
  );
}

/** Small label and value pairs under a meter. */
export function Stats({
  items,
}: {
  items: { label: string; value: string | null | undefined }[];
}) {
  const shown = items.filter((i) => i.value != null && i.value !== "");
  if (!shown.length) return null;
  return (
    <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
      {shown.map((i) => (
        <View key={i.label}>
          <Text className="text-2xs uppercase text-muted-foreground">
            {i.label}
          </Text>
          <Text weight="medium" className="text-xs text-foreground">
            {i.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Tiny sparkline rendered with stacked Views (no SVG dependency). Each sample
 * is a thin vertical bar scaled to the series max - good enough for a 20-point
 * trend strip and avoids pulling in react-native-svg.
 */
export function Sparkline({
  data,
  stroke,
  height = 28,
  max: fixedMax,
}: {
  data: number[];
  stroke: string;
  height?: number;
  /** Top of the scale, like 100 for percent. Defaults to the biggest value. */
  max?: number;
}) {
  const max = fixedMax ?? Math.max(1, ...data);
  return (
    <View className="flex-row items-end gap-[1px]" style={{ height }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(1, (v / max) * height),
            backgroundColor: stroke,
            opacity: 0.5 + (i / data.length) * 0.5,
          }}
        />
      ))}
    </View>
  );
}
