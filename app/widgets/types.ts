/**
 * Home-screen widget data contract.
 *
 * This module is the single source of truth for the payload the app publishes
 * to the native widget hosts. The exact same shape is decoded by:
 *
 *   - iOS      modules/termix-widgets/ios/widget/WidgetSnapshot.swift
 *   - Android  modules/termix-widgets/android/src/main/java/expo/modules/
 *              termixwidgets/WidgetSnapshot.kt
 *
 * Any change here MUST be mirrored in both decoders. Bump SNAPSHOT_VERSION when
 * the shape changes incompatibly — the decoders drop snapshots whose version
 * they don't understand and render their empty state instead of crashing or
 * showing stale/garbled data.
 */

/** Payload format version. Bump on breaking changes to WidgetSnapshot. */
export const SNAPSHOT_VERSION = 1;

/** URL scheme registered in app.json. */
export const APP_SCHEME = "termix-mobile";

/** Deep-link host segment reserved for widget-originated links. */
export const WIDGET_LINK_PREFIX = `${APP_SCHEME}://widget`;

/**
 * Hard cap on hosts written into a snapshot. Widget hosts (especially iOS
 * WidgetKit) limit how much data an extension may hold; the largest layout
 * shows 8 entries, and the Android collection widget scrolls through the rest.
 */
export const MAX_SNAPSHOT_HOSTS = 12;

/** Hard cap on snippets written into a snapshot. Same reasoning as hosts. */
export const MAX_SNAPSHOT_SNIPPETS = 12;

export type WidgetHostStatus = "online" | "offline" | "unknown";

/**
 * What the widget should render at the top level. Keeps "no data" cases
 * explicit rather than inferring them from an empty host array.
 */
export type WidgetState =
  | "ready" // hosts present
  | "empty" // signed in, but no hosts to show
  | "signed-out"; // no server / not authenticated

/** Session type a widget tap opens. Mirrors SessionType in TerminalSessionsContext. */
export type WidgetSessionType = "terminal" | "stats" | "filemanager";

export interface WidgetHostEntry {
  id: number;
  /** Display name, already trimmed/fallen back to the address. */
  name: string;
  /** Secondary line — `user@ip` (or a redacted placeholder). */
  subtitle: string;
  /** Folder path, "" when the host lives at the root. */
  folder: string;
  status: WidgetHostStatus;
  /** CPU load percentage 0–100, or null when unknown. */
  cpu: number | null;
  /** Memory usage percentage 0–100, or null when unknown. */
  mem: number | null;
  pinned: boolean;
  /** Deep link the widget opens on tap. Precomputed so native code stays dumb. */
  url: string;
}

export interface WidgetSnippetEntry {
  id: number;
  name: string;
  /** Folder the snippet lives in, "" when unfiled. */
  folder: string;
  /** One-line preview of the command, already truncated (or redacted). */
  preview: string;
  /** Deep link the widget opens on tap — copies the snippet and opens the list. */
  url: string;
}

export interface WidgetSummary {
  total: number;
  online: number;
  offline: number;
  unknown: number;
}

export interface WidgetSnapshot {
  version: number;
  /** Epoch millis the snapshot was produced. Widgets show relative freshness. */
  updatedAt: number;
  state: WidgetState;
  /** Accent color as #rrggbb, so widgets follow the in-app accent. */
  accent: string;
  /** Server label (host portion only) or "" when unknown. */
  server: string;
  summary: WidgetSummary;
  hosts: WidgetHostEntry[];
  snippets: WidgetSnippetEntry[];
}

/** Preferences that shape what the widgets are allowed to display. */
export interface WidgetPreferences {
  /** Master switch. When off, the app publishes an empty signed-out snapshot. */
  enabled: boolean;
  /** Show `user@ip` under each host. Off keeps addresses off the lock screen. */
  showAddresses: boolean;
  /** Include hosts that are offline or of unknown status. */
  includeOffline: boolean;
  /** Only surface pinned hosts. */
  pinnedOnly: boolean;
  /** Publish snippets to the Snippets widget. Off keeps commands off the home screen. */
  includeSnippets: boolean;
  /** Show the command preview under each snippet name. */
  showSnippetPreview: boolean;
}

export const DEFAULT_WIDGET_PREFERENCES: WidgetPreferences = {
  enabled: true,
  showAddresses: true,
  includeOffline: true,
  pinnedOnly: false,
  includeSnippets: true,
  showSnippetPreview: true,
};

/** Builds the deep link a widget entry opens. */
export function buildWidgetLink(
  hostId: number,
  type: WidgetSessionType = "terminal",
): string {
  return `${WIDGET_LINK_PREFIX}/connect?hostId=${hostId}&type=${type}`;
}

/**
 * Builds the deep link a snippet tile opens: the app copies the snippet to the
 * clipboard and shows the snippets list. Snippet *content* never leaves the app
 * through the link itself — only the id travels.
 */
export function buildWidgetSnippetLink(snippetId: number): string {
  return `${WIDGET_LINK_PREFIX}/snippet?snippetId=${snippetId}`;
}

/** Deep link that just brings the app to the hosts list. */
export function buildWidgetOpenLink(): string {
  return `${WIDGET_LINK_PREFIX}/open`;
}

/** Deep link that opens the snippets list without copying anything. */
export function buildWidgetSnippetsListLink(): string {
  return `${WIDGET_LINK_PREFIX}/snippets`;
}
