/**
 * Home-screen widget integration.
 *
 * - `types` holds the payload contract shared with the native decoders.
 * - `snapshot` turns app state into that payload (pure).
 * - `publish` writes it to the native widget hosts.
 * - `preferences` persists what the user allows widgets to show.
 * - `useWidgetDeepLink` turns widget taps back into in-app navigation.
 */

export * from "./types";
export {
  buildWidgetSnapshot,
  buildSignedOutSnapshot,
  formatServerLabel,
  snippetPreview,
  isSnapshotEquivalent,
  type BuildSnapshotInput,
  type WidgetMetricsEntry,
} from "./snapshot";
export {
  publishHostSnapshot,
  publishSnippetSnapshot,
  publishSignedOutSnapshot,
  republishWithPreferences,
  resetWidgets,
  type HostSnapshotInput,
} from "./publish";
export {
  getCachedWidgetPreferences,
  loadWidgetPreferences,
  saveWidgetPreferences,
  subscribeToWidgetPreferences,
} from "./preferences";
export { useWidgetDeepLink, parseWidgetLink } from "./useWidgetDeepLink";
export { isWidgetSupported } from "@/modules/termix-widgets";
