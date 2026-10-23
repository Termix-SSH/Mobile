import { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  Server,
  SquareTerminal,
  Settings,
  Sparkles,
} from "lucide-react-native";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useOrientation } from "@/utils/orientation";
import { useFeatureAvailable } from "@/core/features/hooks";

const ICONS: Record<
  string,
  (props: { color: string; size: number }) => React.ReactNode
> = {
  hosts: (p) => <Server {...p} />,
  sessions: (p) => <SquareTerminal {...p} />,
  ai: (p) => <Sparkles {...p} />,
  settings: (p) => <Settings {...p} />,
};

const LABELS: Record<string, string> = {
  hosts: "Hosts",
  sessions: "Sessions",
  ai: "AI",
  settings: "Settings",
};

/**
 * Bottom tab bar matching the web MobileBottomBar: square, bg-sidebar,
 * top border, accent-colored active item, lucide icons, safe-area aware.
 */
export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { isLandscape } = useOrientation();
  const resolveColor = useThemeColor();
  const aiAvailable = useFeatureAvailable("ai");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const focusedRoute = state.routes[state.index];

  // The AI tab is hidden when the active account cannot use it (for example
  // after switching to This device), so leave it instead of showing nothing.
  const onUnavailableAi = focusedRoute?.name === "ai" && !aiAvailable;
  useEffect(() => {
    if (onUnavailableAi) navigation.navigate("hosts");
  }, [onUnavailableAi, navigation]);

  // Android resizes the window for the keyboard, which would lift the bar
  // over the chat input. iOS covers the bar instead, so leave it alone there.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const accent = resolveColor("accent-brand") ?? "#f59145";
  const muted = resolveColor("muted-foreground") ?? "#a4a4a4";
  const iconSize = isLandscape ? 18 : 20;

  if (focusedRoute?.name === "ai" && keyboardVisible) return null;

  return (
    <View
      className="flex-row items-stretch border-t border-border bg-sidebar"
      style={{ paddingBottom: insets.bottom }}
    >
      {state.routes
        .filter((route) => route.name !== "ai" || aiAvailable)
        .map((route) => {
          const focused = route.key === focusedRoute?.key;
          const color = focused ? accent : muted;
          const icon = ICONS[route.name];
          const label = LABELS[route.name] ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              className="flex-1 items-center justify-center gap-0.5"
              style={{ minHeight: isLandscape ? 48 : 56, paddingVertical: 6 }}
            >
              {icon?.({ color, size: iconSize })}
              <Text
                weight={focused ? "medium" : "regular"}
                className="text-[10px]"
                style={{ color }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
    </View>
  );
}
