import { router } from "expo-router";
import { trace } from "@/core/log/trace";

/**
 * Opens one of the main tabs. From a screen stacked over the tabs it goes back
 * to them; a push would stack a second copy of every tab, sessions included.
 */
export function openTab(href: string) {
  const stacked = router.canDismiss();
  trace("nav", "open tab", { href, stacked });
  if (stacked) router.dismissTo(href as never);
  else router.navigate(href as never);
}
