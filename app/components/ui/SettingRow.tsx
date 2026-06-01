import { View } from "react-native";
import { Text } from "./Text";

/**
 * SettingRow — label + optional description on the left, a control on the
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
  return (
    <View
      className={`flex-row items-center justify-between gap-3 py-2.5 ${last ? "" : "border-b border-border"}`}
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text weight="medium" className="text-xs text-foreground">
            {label}
          </Text>
          {badge ? (
            <View className="border border-accent-brand/30 bg-accent-brand/15 px-1 py-px">
              <Text
                weight="bold"
                className="text-[8px] uppercase tracking-wider text-accent-brand"
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {description ? (
          <Text className="mt-0.5 text-[10px] text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      <View className="shrink-0">{children}</View>
    </View>
  );
}
