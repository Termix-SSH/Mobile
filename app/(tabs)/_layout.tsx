import { Tabs, usePathname } from "expo-router";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { BottomBar, TABS } from "@/screens/shell/BottomBar";
import { shellLayout } from "@/screens/shell/layout";
import { SideBar } from "@/screens/shell/SideBar";
import { BottomBarShown } from "@/ui/bottom-inset";
import { useWindowInfo } from "@/utils/window-class";

export default function TabLayout() {
  const { sessions } = useTerminalSessions();
  const pathname = usePathname();
  const win = useWindowInfo();
  const isWide = shellLayout(win, 0).nav === "side";

  // Phones hide the bar on a full-screen session. The sidebar always stays.
  const hideTabBar = !isWide && pathname === "/sessions" && sessions.length > 0;

  return (
    <BottomBarShown.Provider value={!isWide && !hideTabBar}>
      <Tabs
        tabBar={
          hideTabBar
            ? () => null
            : isWide
              ? (props) => <SideBar {...props} />
              : (props) => <BottomBar {...props} />
        }
        screenOptions={{
          headerShown: false,
          tabBarPosition: isWide ? "left" : "bottom",
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{ title: tab.label }}
          />
        ))}
      </Tabs>
    </BottomBarShown.Provider>
  );
}
