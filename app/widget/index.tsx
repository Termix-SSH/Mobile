import { Redirect } from "expo-router";

// Bare `termix-mobile://widget`.
export default function WidgetIndex() {
  return <Redirect href="/(tabs)/hosts" />;
}
