import { Redirect } from "expo-router";

// `termix-mobile://widget/snippets` — the snippets list.
export default function WidgetSnippets() {
  return <Redirect href="/(tabs)/hosts" />;
}
