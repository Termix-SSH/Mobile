import { View } from "react-native";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

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
    <View className="bg-card border border-border p-3">
      <View className="flex-row items-center gap-2 mb-2">
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

/** A labeled usage bar (CPU / memory / disk). */
export function Meter({
  percent,
  history,
}: {
  percent: number;
  history?: number[];
}) {
  const color = useThemeColor();
  const pct = Math.max(0, Math.min(100, percent));
  const barColor =
    pct >= 90
      ? (color("destructive") ?? "#ef4444")
      : pct >= 70
        ? "#f59e0b"
        : (color("accent-brand") ?? "#f59145");
  return (
    <View className="gap-1.5">
      {history && history.length > 1 ? (
        <Sparkline data={history} stroke={barColor} />
      ) : null}
      <View className="h-2 bg-muted overflow-hidden">
        <View
          style={{ width: `${pct}%`, backgroundColor: barColor }}
          className="h-full"
        />
      </View>
    </View>
  );
}

/**
 * Tiny sparkline rendered with stacked Views (no SVG dependency). Each sample
 * is a thin vertical bar scaled to the series max — good enough for a 20-point
 * trend strip and avoids pulling in react-native-svg.
 */
export function Sparkline({
  data,
  stroke,
  height = 28,
}: {
  data: number[];
  stroke: string;
  height?: number;
}) {
  const max = Math.max(1, ...data);
  return (
    <View
      className="flex-row items-end gap-[1px]"
      style={{ height }}
    >
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
