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
        <View className="flex-row items-end justify-between px-4 pt-3 pb-3 border-b border-border">
          <View className="flex-1 min-w-0">
            <Text weight="bold" className="text-xl text-foreground">
              {title}
            </Text>
            {subtitle ? (
              <Text className="text-xs text-muted-foreground mt-0.5">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerRight ? (
            <View className="shrink-0 ml-3">{headerRight}</View>
          ) : null}
        </View>
      ) : null}
      <View className="flex-1">{children}</View>
    </View>
  );
}
