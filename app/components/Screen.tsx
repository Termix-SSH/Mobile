import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/app/components/ui";

/**
 * Screen — top-level themed container with safe-area top padding and an
 * optional header (title + actions). Used by Hosts / Tools / Settings.
 */
export function Screen({
  title,
  subtitle,
  headerRight,
  children,
  scrollableHeader,
}: {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  /** When true, the header is part of the scroll content (caller handles it). */
  scrollableHeader?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {title && !scrollableHeader ? (
        <View className="flex-row items-end justify-between border-b border-border px-4 pb-3 pt-3">
          <View className="min-w-0 flex-1">
            <Text weight="bold" className="text-xl text-foreground">
              {title}
            </Text>
            {subtitle ? (
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerRight ? (
            <View className="ml-3 shrink-0">{headerRight}</View>
          ) : null}
        </View>
      ) : null}
      <View className="flex-1">{children}</View>
    </View>
  );
}
