import { Pressable, ScrollView, View } from "react-native";
import { Text } from "./Text";

/**
 * Tab strip like core's: text tabs with an accent underline on the active one.
 * "fill" spreads the tabs across the row, otherwise the strip scrolls.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  fill = true,
  size = "default",
  className,
}: {
  options: { id: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  fill?: boolean;
  size?: "default" | "sm";
  className?: string;
}) {
  const items = options.map((opt) => {
    const active = opt.id === value;
    return (
      <Pressable
        key={opt.id}
        onPress={() => onChange(opt.id)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        className={`min-h-11 flex-row items-center justify-center gap-1.5 border-b-2 px-3 ${size === "sm" ? "py-1.5" : "py-2"} ${active ? "border-accent-brand" : "border-transparent hover:bg-muted/30 active:bg-muted/50"} ${fill ? "flex-1" : ""}`}
      >
        {opt.icon ?? null}
        <Text
          weight={active ? "medium" : "regular"}
          numberOfLines={1}
          className={`${size === "sm" ? "text-meta" : "text-xs"} ${active ? "text-accent-text" : "text-muted-foreground"}`}
        >
          {opt.label}
        </Text>
      </Pressable>
    );
  });

  if (fill) {
    return (
      <View
        accessibilityRole="tablist"
        className={`flex-row border-b border-border ${className ?? ""}`}
      >
        {items}
      </View>
    );
  }
  return (
    <View className={`border-b border-border ${className ?? ""}`}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
      >
        {items}
      </ScrollView>
    </View>
  );
}
