import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import {
  House,
  Server,
  Settings,
  SquareTerminal,
  Wrench,
} from "lucide-react-native";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { useSessionStatuses, type SessionState } from "@/core/sessions/status";
import { useOrientation } from "@/utils/orientation";

type Icon = (props: { color: string; size: number }) => React.ReactNode;

export const TABS: { name: string; label: string; icon: Icon }[] = [
  { name: "home", label: "Home", icon: (p) => <House {...p} /> },
  { name: "hosts", label: "Hosts", icon: (p) => <Server {...p} /> },
  {
    name: "sessions",
    label: "Sessions",
    icon: (p) => <SquareTerminal {...p} />,
  },
  { name: "tools", label: "Tools", icon: (p) => <Wrench {...p} /> },
  { name: "settings", label: "Settings", icon: (p) => <Settings {...p} /> },
];

const TROUBLE: SessionState[] = ["reconnecting", "offline", "failed"];

/** The worst state among open tabs, for the mark on the Sessions tab. */
export function sessionsMark(
  ids: string[],
  statuses: Readonly<Record<string, { state: SessionState }>>,
): "failed" | "trouble" | null {
  let mark: "failed" | "trouble" | null = null;
  for (const id of ids) {
    const state = statuses[id]?.state;
    if (state === "failed") return "failed";
    if (state && TROUBLE.includes(state)) mark = "trouble";
  }
  return mark;
}

/** Bottom tab bar like core's mobile bar: square, bg-sidebar, accent active. */
export function BottomBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { isLandscape } = useOrientation();
  const color = useThemeColor();
  const { sessions } = useTerminalSessions();
  const statuses = useSessionStatuses();
  const accent = color("accent-brand");
  const muted = color("muted-foreground");
  const iconSize = isLandscape ? 18 : 20;
  const mark = sessionsMark(
    sessions.map((s) => s.id),
    statuses,
  );

  return (
    <View
      className="flex-row items-stretch border-t border-border bg-sidebar"
      style={{ paddingBottom: insets.bottom }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;
        const focused = state.index === index;
        const tint = focused ? accent : muted;
        const count = route.name === "sessions" ? sessions.length : 0;

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
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={
              count ? `${tab.label}, ${count} open` : tab.label
            }
            className="flex-1 items-center justify-center gap-0.5"
            style={{ minHeight: isLandscape ? 48 : 56, paddingVertical: 6 }}
          >
            <View>
              {tab.icon({ color: tint, size: iconSize })}
              {count > 0 ? (
                <View
                  className="absolute -right-2.5 -top-1.5 min-w-4 items-center px-1"
                  style={{
                    backgroundColor:
                      mark === "failed"
                        ? color("destructive")
                        : mark
                          ? color("warning")
                          : accent,
                  }}
                >
                  <Text
                    weight="bold"
                    className="text-[9px]"
                    style={{ color: color("background") }}
                  >
                    {count}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              weight={focused ? "medium" : "regular"}
              className="text-[10px]"
              style={{ color: tint }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
