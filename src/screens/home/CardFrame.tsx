import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { ExecTarget } from "@/core/exec";
import type { FeatureIcon } from "@/core/features/types";
import { Text } from "@/ui";

/** The box every Home card draws in: title, then its body or why it can't. */
export function CardFrame({
  title,
  icon: Icon,
  target,
  error,
  loading,
  onPress,
  children,
}: {
  title: string;
  icon: FeatureIcon;
  target: ExecTarget;
  error?: string;
  loading?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const color = useThemeColor();
  const muted = color("muted-foreground");
  const reason =
    target.phase === "failed" ? target.failure.message : error || null;
  // A plain View when there is nothing to press, so a parent can take the tap.
  const Box = onPress ? Pressable : View;
  return (
    <Box
      onPress={onPress}
      className="gap-2 border border-border bg-card px-3 py-2.5 active:bg-muted/30"
    >
      <View className="flex-row items-center gap-2">
        <Icon size={13} color={muted} />
        <Text className="flex-1 text-[10px] uppercase tracking-[1px] text-muted-foreground">
          {title}
        </Text>
        {target.phase === "local" ? (
          <Text className="text-[10px] text-muted-foreground">this phone</Text>
        ) : null}
      </View>
      {reason ? (
        <Text className="text-[11px] text-muted-foreground" numberOfLines={2}>
          {reason}
        </Text>
      ) : target.phase === "connecting" || loading ? (
        <ActivityIndicator size="small" color={color("accent-brand")} />
      ) : (
        children
      )}
    </Box>
  );
}
