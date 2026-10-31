import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { useSessionStatuses } from "@/core/sessions/status";
import { sessionsMark, TABS } from "@/screens/shell/BottomBar";
import { useWindowInfo } from "@/utils/window-class";
import { SIDEBAR_WIDTH } from "@/screens/shell/layout";

export { SIDEBAR_WIDTH };
/** The rail on a phone held sideways, where height is short. */
const SHORT_SIDEBAR_WIDTH = 64;

/** Navigation rail for tablets and wide windows. Same tabs as the bottom bar. */
export function SideBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { isShort } = useWindowInfo();
  const color = useThemeColor();
  const { sessions } = useTerminalSessions();
  const statuses = useSessionStatuses();
  const accent = color("accent-brand");
  const muted = color("muted-foreground");
  const mark = sessionsMark(
    sessions.map((s) => s.id),
    statuses,
  );

  return (
    <View
      className="items-stretch border-r border-border bg-sidebar"
      style={{
        // The notch side inset comes on top of the rail, not out of it.
        width: (isShort ? SHORT_SIDEBAR_WIDTH : SIDEBAR_WIDTH) + insets.left,
        paddingTop: insets.top + (isShort ? 4 : 8),
        paddingBottom: insets.bottom + (isShort ? 4 : 8),
        paddingLeft: insets.left,
      }}
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
            className={`items-center justify-center gap-1 hover:bg-muted/30 ${isShort ? "flex-1" : "py-3"}`}
            style={{
              borderLeftWidth: 2,
              borderLeftColor: focused ? accent : "transparent",
            }}
          >
            <View>
              {tab.icon({ color: tint, size: isShort ? 20 : 22 })}
              {count > 0 ? (
                <View
                  className="absolute -right-3 -top-1.5 min-w-4 items-center px-1"
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
              numberOfLines={1}
              className={isShort ? "text-[10px]" : "text-[11px]"}
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
