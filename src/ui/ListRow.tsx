import { Pressable, View, type PressableProps } from "react-native";
import { useUiPrefs } from "@/core/ui-prefs";
import { Text } from "./Text";

export type ListRowTone =
  "brand" | "muted" | "success" | "warning" | "destructive" | "none";

const STRIPE: Record<ListRowTone, string> = {
  brand: "bg-accent-brand/60",
  muted: "bg-muted-foreground/30",
  success: "bg-green-500/70",
  warning: "bg-warning/70",
  destructive: "bg-destructive/70",
  none: "bg-transparent",
};

/**
 * One row in a list, drawn like core's list kit: a colored stripe on the left,
 * a title with an optional muted line under it, and actions under the row.
 */
export function ListRow({
  title,
  icon,
  badges,
  meta,
  index = 0,
  tone = "none",
  color,
  selected,
  dimmed,
  destructive,
  leading,
  trailing,
  actions,
  onPress,
  onLongPress,
  className,
  children,
  ...rest
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  /** Position in the list, odd rows get the zebra tint. */
  index?: number;
  tone?: ListRowTone;
  /** A custom stripe color, like a folder's own color. */
  color?: string;
  selected?: boolean;
  dimmed?: boolean;
  /** Red title, for delete rows in menus. */
  destructive?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Always shown on touch screens, there is no hover. */
  actions?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  className?: string;
  children?: React.ReactNode;
} & Omit<PressableProps, "children" | "onPress" | "onLongPress">) {
  const compact = useUiPrefs().density === "compact";
  const bg = selected
    ? "bg-accent-brand/10"
    : index % 2 === 1
      ? "bg-muted/15"
      : "";
  return (
    <Pressable
      {...rest}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress || onLongPress ? "button" : undefined}
      accessibilityState={{ selected: !!selected }}
      // A screen reader has no long press, so it gets a named action.
      accessibilityActions={
        onLongPress ? [{ name: "longpress", label: "More actions" }] : undefined
      }
      onAccessibilityAction={
        onLongPress
          ? (e) => {
              if (e.nativeEvent.actionName === "longpress") onLongPress();
            }
          : undefined
      }
      className={`${compact ? "min-h-9" : "min-h-11"} flex-row items-stretch border-b border-border/40 hover:bg-muted/30 active:bg-muted/50 ${bg} ${dimmed ? "opacity-60" : ""} ${className ?? ""}`}
    >
      <View
        className={`w-[3px] shrink-0 ${selected ? "bg-accent-brand" : color ? "" : STRIPE[tone]}`}
        style={color && !selected ? { backgroundColor: color } : undefined}
      />
      {leading ? (
        <View className="shrink-0 justify-center pl-2.5">{leading}</View>
      ) : null}
      <View
        className={`min-w-0 flex-1 justify-center gap-1 ${compact ? "py-1.5" : "py-2.5"} pl-2.5 pr-2`}
      >
        <View className="min-w-0 flex-row items-center gap-1.5">
          {icon ? <View className="shrink-0">{icon}</View> : null}
          {typeof title === "string" ? (
            <Text
              weight="bold"
              numberOfLines={1}
              className={`shrink text-row ${destructive ? "text-destructive" : "text-foreground"}`}
            >
              {title}
            </Text>
          ) : (
            title
          )}
          {badges}
        </View>
        {meta ? (
          typeof meta === "string" ? (
            <Text
              numberOfLines={1}
              className="text-meta text-muted-foreground/80"
            >
              {meta}
            </Text>
          ) : (
            meta
          )
        ) : null}
        {children}
        {actions ? (
          <View className="mt-0.5 flex-row flex-wrap items-center gap-0.5 border-t border-border/30 pt-1">
            {actions}
          </View>
        ) : null}
      </View>
      {trailing ? (
        <View className="shrink-0 justify-center pr-3">{trailing}</View>
      ) : null}
    </Pressable>
  );
}

/** Square icon button for a ListRow's actions. */
export function ListRowAction({
  label,
  tone = "default",
  onPress,
  disabled,
  children,
}: {
  label: string;
  tone?: "default" | "brand" | "destructive";
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const pressed =
    tone === "destructive" ? "active:bg-destructive/10" : "active:bg-muted";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-8 w-8 items-center justify-center ${pressed} ${disabled ? "opacity-40" : ""}`}
    >
      {children}
    </Pressable>
  );
}
