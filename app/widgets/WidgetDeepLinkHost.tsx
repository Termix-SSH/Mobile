import { useWidgetDeepLink } from "./useWidgetDeepLink";
import { RunSnippetSheet } from "./RunSnippetSheet";

/**
 * Mount point for everything a home-screen widget can trigger.
 *
 * Host taps navigate straight into a session; snippet taps surface the run
 * sheet rendered here. Kept as one component so the root layout has a single
 * line to mount, and so the listener and its UI can't drift apart.
 */
export function WidgetDeepLinkHost() {
  const { pendingSnippet, dismissSnippet } = useWidgetDeepLink();

  return <RunSnippetSheet snippet={pendingSnippet} onClose={dismissSnippet} />;
}
