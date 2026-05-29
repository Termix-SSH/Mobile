import { Tabs, usePathname } from "expo-router";
import { useTerminalSessions } from "../contexts/TerminalSessionsContext";
import { CustomTabBar } from "@/app/components/CustomTabBar";

export default function TabLayout() {
  const { sessions } = useTerminalSessions();
  const pathname = usePathname();

  // Hide the main tab bar when viewing a full-screen session.
  const hideTabBar = pathname === "/sessions" && sessions.length > 0;

  return (
    <Tabs
      tabBar={hideTabBar ? () => null : (props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="hosts" options={{ title: "Hosts" }} />
      <Tabs.Screen name="sessions" options={{ title: "Sessions" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
