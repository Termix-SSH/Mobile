import { Stack } from "expo-router";

// Routes for the `termix-mobile://widget/...` deep links.
//
// These screens render nothing and immediately redirect. They exist only
// because expo-router resolves a widget link as the path "/widget/connect"
// (and friends), and without a file to match it the user lands on "Unmatched
// Route — Page could not be found" instead of the session they tapped.
//
// The navigation itself belongs to useWidgetDeepLink, which is mounted at the
// root and sees the URL through its Linking listener. Doing the work there
// keeps one code path for cold starts, warm taps, and links that arrive while
// signed out.
export default function WidgetLinkLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
}
