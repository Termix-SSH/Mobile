import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { FeatureIcon } from "@/core/features/types";
import { Text } from "@/ui";

/** The box every Home dashboard card draws in. */
export function HomeCard({
  title,
  icon: Icon,
  meta,
  action,
  onAction,
  loading,
  error,
  padded = false,
  children,
}: {
  title: string;
  icon: FeatureIcon;
  /** Small text at the right of the title, like a count. */
  meta?: string;
  /** Link at the right of the title, like "See all". */
  action?: string;
  onAction?: () => void;
  loading?: boolean;
  error?: string | null;
  /** Pads the body, for cards that aren't rows. */
  padded?: boolean;
  children?: ReactNode;
}) {
  const color = useThemeColor();
  const muted = color("muted-foreground");
  return (
    <View className="border border-border bg-card">
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        <Icon size={13} color={muted} />
        <Text
          className="flex-1 text-[10px] uppercase tracking-[1px] text-muted-foreground"
          numberOfLines={1}
        >
          {title}
        </Text>
        {meta ? (
          <Text className="text-[10px] text-muted-foreground">{meta}</Text>
        ) : null}
        {action && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            hitSlop={8}
            className="flex-row items-center gap-0.5 active:opacity-60"
          >
            <Text className="text-[11px] text-accent-brand">{action}</Text>
            <ChevronRight size={12} color={color("accent-brand")} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text className="px-3 py-2.5 text-[11px] text-muted-foreground">
          {error}
        </Text>
      ) : loading ? (
        <View className="items-center py-4">
          <ActivityIndicator size="small" color={color("accent-brand")} />
        </View>
      ) : padded ? (
        <View className="px-3 py-2.5">{children}</View>
      ) : (
        children
      )}
    </View>
  );
}

/** One label and value in a card's stat grid. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const valueClass =
    tone === "good"
      ? "text-success-text"
      : tone === "bad"
        ? "text-destructive-text"
        : "text-foreground";
  return (
    <View className="min-w-[30%] flex-1 gap-0.5">
      <Text className="text-[10px] uppercase tracking-[1px] text-muted-foreground">
        {label}
      </Text>
      <Text
        weight="bold"
        className={`text-base ${valueClass}`}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** A small round status mark. */
export function Dot({ state }: { state: "online" | "offline" | "unknown" }) {
  const cls =
    state === "online"
      ? "bg-success"
      : state === "offline"
        ? "bg-destructive"
        : "bg-muted-foreground/40";
  return <View className={`h-2 w-2 rounded-full ${cls}`} />;
}
