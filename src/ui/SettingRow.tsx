import { View } from "react-native";
import { useUiPrefs } from "@/core/ui-prefs";
import { Text } from "./Text";

/**
 * SettingRow - label + optional description on the left, a control on the
 * right. Mirrors the web app's SettingRow used throughout user preferences.
 */
export function SettingRow({
  label,
  description,
  badge,
  children,
  last,
}: {
  label: string;
  description?: string;
  badge?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  const compact = useUiPrefs().density === "compact";
  return (
    <View
      className={`${compact ? "min-h-9 py-1.5" : "min-h-11 py-2.5"} flex-row items-center justify-between gap-3 ${last ? "" : "border-b border-border/40"}`}
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text weight="medium" className="text-row text-foreground">
            {label}
          </Text>
          {badge ? (
            <View className="border border-accent-brand/30 bg-accent-brand/15 px-1 py-px">
              <Text
                weight="bold"
                className="text-[8px] uppercase tracking-wider text-accent-text"
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {description ? (
          <Text className="mt-0.5 text-meta text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      <View className="shrink-0">{children}</View>
    </View>
  );
}
