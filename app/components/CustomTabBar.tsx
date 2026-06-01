import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Server, SquareTerminal, Settings } from "lucide-react-native";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { useOrientation } from "@/app/utils/orientation";

const ICONS: Record<
  string,
  (props: { color: string; size: number }) => React.ReactNode
> = {
  hosts: (p) => <Server {...p} />,
  sessions: (p) => <SquareTerminal {...p} />,
  settings: (p) => <Settings {...p} />,
};

const LABELS: Record<string, string> = {
  hosts: "Hosts",
  sessions: "Sessions",
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
  const accent = resolveColor("accent-brand") ?? "#f59145";
  const muted = resolveColor("muted-foreground") ?? "#a4a4a4";
  const iconSize = isLandscape ? 18 : 20;

  return (
    <View
      className="flex-row items-stretch border-t border-border bg-sidebar"
      style={{ paddingBottom: insets.bottom }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
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
