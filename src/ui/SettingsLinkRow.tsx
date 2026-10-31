import { Pressable, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useUiPrefs } from "@/core/ui-prefs";
import { Text } from "./Text";

type IconType = React.ComponentType<{ size?: number; color?: string }>;

/** A settings row that opens another screen. */
export function SettingsLinkRow({
  label,
  description,
  icon: Icon,
  destructive,
  value,
  onPress,
  last,
}: {
  label: string;
  description?: string;
  icon?: IconType;
  destructive?: boolean;
  /** Current value shown before the chevron. */
  value?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const color = useThemeColor();
  const compact = useUiPrefs().density === "compact";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`${compact ? "min-h-9 py-1.5" : "min-h-11 py-2.5"} flex-row items-center gap-3 active:bg-muted/40 ${last ? "" : "border-b border-border/40"}`}
    >
      {Icon ? (
        <Icon
          size={15}
          color={color(destructive ? "destructive" : "muted-foreground")}
        />
      ) : null}
      <View className="min-w-0 flex-1">
        <Text
          weight="medium"
          className={`text-row ${destructive ? "text-destructive-text" : "text-foreground"}`}
        >
          {label}
        </Text>
        {description ? (
          <Text className="mt-0.5 text-meta text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text className="text-meta text-muted-foreground" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <ChevronRight size={15} color={color("muted-foreground")} />
    </Pressable>
  );
}
