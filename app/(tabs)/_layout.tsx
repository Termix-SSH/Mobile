import { Tabs, usePathname } from "expo-router";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { BottomBar, TABS } from "@/screens/shell/BottomBar";
import { shellLayout } from "@/screens/shell/layout";
import { SideBar } from "@/screens/shell/SideBar";
import { BottomBarShown, SideBarShown } from "@/ui/bottom-inset";
import { useWindowInfo } from "@/utils/window-class";

export default function TabLayout() {
  const { sessions } = useTerminalSessions();
  const pathname = usePathname();
  const win = useWindowInfo();
  const layout = shellLayout(win, 0);
  const isWide = layout.nav === "side";

  // Phones hide the bar on a full screen session. Tablets keep the sidebar.
  const hideTabBar =
    layout.fullScreenSessions &&
    pathname === "/sessions" &&
    sessions.length > 0;

  return (
    <BottomBarShown.Provider value={!isWide && !hideTabBar}>
      <SideBarShown.Provider value={isWide && !hideTabBar}>
        <Tabs
          // Keep the default detach. With it off, inactive tabs get display none and
          // Fabric deletes their native views, so terminals came back empty.
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
      </SideBarShown.Provider>
    </BottomBarShown.Provider>
  );
}
