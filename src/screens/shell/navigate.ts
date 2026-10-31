import { router } from "expo-router";

/**
 * Opens one of the main tabs. From a screen stacked over the tabs it goes back
 * to them; a push would stack a second copy of every tab, sessions included.
 */
export function openTab(href: string) {
  if (router.canDismiss()) router.dismissTo(href as never);
  else router.navigate(href as never);
}
