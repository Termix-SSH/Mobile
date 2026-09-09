import { Redirect } from "expo-router";

// `termix-mobile://widget/open` — just bring the app up on the hosts list.
export default function WidgetOpen() {
  return <Redirect href="/(tabs)/hosts" />;
}
