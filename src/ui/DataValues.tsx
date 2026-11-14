import { View } from "react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import type {
  DataBar,
  DataStat,
  DataTone,
  DataValue,
} from "@/core/data-values/data-value";
import { Text } from "./Text";

/**
 * "row": items side by side (host rows). "stack": one per line (cards).
 * Same names as the web's DataValues.
 */
export type DataLayout = "row" | "stack";

const TONE_TOKEN: Record<DataTone, string> = {
  default: "accent-brand",
  good: "success",
  warn: "warning",
  bad: "destructive",
  muted: "muted-foreground",
};

/** Bars with no tone of their own warn from 70% and turn bad from 90%. */
function barTone(item: DataBar): DataTone {
  if (item.tone) return item.tone;
  if (item.value === null) return "muted";
  if (item.value >= 0.9) return "bad";
  if (item.value >= 0.7) return "warn";
  return "default";
}

function Bar({ item, layout }: { item: DataBar; layout: DataLayout }) {
  const color = useThemeColor();
  const fill = color(TONE_TOKEN[barTone(item)]);
  const percent =
    item.value === null ? "-" : `${Math.round(item.value * 100)}%`;
  const track = (
    <View
      className={`h-[3px] overflow-hidden rounded-full bg-muted-foreground/15 ${
        layout === "stack" ? "w-full" : "w-9"
      }`}
    >
      <View
        style={{
          width: `${Math.round((item.value ?? 0) * 100)}%`,
          backgroundColor: fill,
        }}
        className="h-full rounded-full"
      />
    </View>
  );
  if (layout === "stack") {
    return (
      <View className="gap-0.5" testID="data-bar">
        <View className="flex-row justify-between">
          <Text className="text-[10px] text-muted-foreground">
            {item.label}
          </Text>
          <Text className="text-[10px] text-muted-foreground">
            {percent}
            {item.detail ? ` ${item.detail}` : ""}
          </Text>
        </View>
        {track}
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-1" testID="data-bar">
      <Text className="text-[9px] uppercase text-muted-foreground">
        {item.label}
      </Text>
      {track}
      <Text className="text-[9px] text-muted-foreground">{percent}</Text>
    </View>
  );
}

function statText(item: DataStat): string {
  if (item.value === null || item.value === "") return "-";
  return item.unit ? `${item.value} ${item.unit}` : String(item.value);
}

function Stat({ item, layout }: { item: DataStat; layout: DataLayout }) {
  const color = useThemeColor();
  const tone = item.tone && item.tone !== "default" ? item.tone : null;
  return (
    <View
      className={
        layout === "stack"
          ? "flex-row justify-between gap-2"
          : "flex-row items-center gap-1"
      }
      testID="data-stat"
    >
      <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
        {item.label}
      </Text>
      <Text
        className="text-[10px] text-foreground"
        style={tone ? { color: color(TONE_TOKEN[tone]) } : undefined}
        numberOfLines={1}
      >
        {statText(item)}
      </Text>
    </View>
  );
}

function Part({ value, layout }: { value: DataValue; layout: DataLayout }) {
  const color = useThemeColor();
  switch (value.shape) {
    case "bars":
      return (
        <>
          {value.items.map((item, index) => (
            <Bar key={`${item.label}-${index}`} item={item} layout={layout} />
          ))}
        </>
      );
    case "stat":
      return (
        <>
          {value.items.map((item, index) => (
            <Stat key={`${item.label}-${index}`} item={item} layout={layout} />
          ))}
        </>
      );
    case "badge": {
      const tone = value.tone ?? "default";
      return (
        <View
          className="border px-1 py-px"
          style={{
            borderColor: color(
              tone === "default" ? "border" : TONE_TOKEN[tone],
              0.5,
            ),
          }}
          testID="data-badge"
        >
          <Text
            className="text-[9px] uppercase tracking-wider"
            style={{
              color: color(
                tone === "default" ? "muted-foreground" : TONE_TOKEN[tone],
              ),
            }}
          >
            {value.label}
          </Text>
        </View>
      );
    }
    case "dot":
      return (
        <View
          accessibilityLabel={value.label || undefined}
          className="size-2 rounded-full"
          style={{ backgroundColor: color(TONE_TOKEN[value.tone]) }}
          testID="data-dot"
        />
      );
    case "text":
      return (
        <Text
          className="text-[10px] text-muted-foreground"
          style={
            value.tone && value.tone !== "muted"
              ? { color: color(TONE_TOKEN[value.tone]) }
              : undefined
          }
          numberOfLines={1}
        >
          {value.text}
        </Text>
      );
  }
}

/** Draws checked data values, the same shapes the web draws. */
export function DataValues({
  values,
  layout = "row",
}: {
  values: DataValue[] | null | undefined;
  layout?: DataLayout;
}) {
  if (!values || values.length === 0) return null;
  return (
    <View
      className={
        layout === "stack" ? "gap-1.5" : "flex-row flex-wrap items-center gap-3"
      }
    >
      {values.map((value, index) => (
        <Part key={`${value.shape}-${index}`} value={value} layout={layout} />
      ))}
    </View>
  );
}
