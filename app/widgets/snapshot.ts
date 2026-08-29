/**
 * Snapshot builder — pure, dependency-free, and therefore trivially testable.
 *
 * Converts the state the Hosts screen already holds (hosts, per-host status,
 * per-host metrics) into the payload the native widgets render. No IO happens
 * here; publishing lives in ./publish.
 */

import type { SSHHost, ServerStatus, Snippet } from "@/types";
import {
  DEFAULT_WIDGET_PREFERENCES,
  MAX_SNAPSHOT_HOSTS,
  MAX_SNAPSHOT_SNIPPETS,
  SNAPSHOT_VERSION,
  buildWidgetLink,
  buildWidgetSnippetLink,
  type WidgetHostEntry,
  type WidgetHostStatus,
  type WidgetPreferences,
  type WidgetSnapshot,
  type WidgetSnippetEntry,
  type WidgetSummary,
} from "./types";

/** Per-host metrics as held by the Hosts screen. */
export interface WidgetMetricsEntry {
  cpu: number | null;
  ram: number | null;
}

export interface BuildSnapshotInput {
  hosts: SSHHost[];
  /** Snippets to expose on the Snippets widget. Omit to publish none. */
  snippets?: Snippet[];
  statuses: Record<number, ServerStatus>;
  metrics?: Record<number, WidgetMetricsEntry>;
  preferences?: WidgetPreferences;
  /** In-app accent color (#rrggbb). */
  accent: string;
  /** Configured server URL, used for the widget's footer label. */
  serverUrl?: string | null;
  /** Whether the user is signed in. Drives the "signed-out" state. */
  authenticated: boolean;
  /** Injected for deterministic tests. */
  now?: number;
}

const STATUS_RANK: Record<WidgetHostStatus, number> = {
  online: 0,
  unknown: 1,
  offline: 2,
};

/** Clamps a metric to an integer 0–100, or null when it isn't usable. */
function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Strips scheme/port/path so the footer shows a compact server label. */
export function formatServerLabel(url: string | null | undefined): string {
  if (!url) return "";
  const withoutScheme = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const host = withoutScheme.split(/[/?#]/)[0] ?? "";
  return host.replace(/:\d+$/, "");
}

function hostStatus(
  host: SSHHost,
  statuses: Record<number, ServerStatus>,
): WidgetHostStatus {
  const status = statuses[host.id]?.status;
  return status === "online" || status === "offline" ? status : "unknown";
}

function hostDisplayName(host: SSHHost): string {
  const name = (host.name ?? "").trim();
  if (name) return name;
  const ip = (host.ip ?? "").trim();
  return ip || `Host ${host.id}`;
}

function hostSubtitle(host: SSHHost, showAddresses: boolean): string {
  // Empty rather than a "Hidden" placeholder: tiles fall back to the folder
  // name, which reads better than a column of identical labels.
  if (!showAddresses) return "";
  const user = (host.username ?? "").trim();
  const ip = (host.ip ?? "").trim();
  if (user && ip) return `${user}@${ip}`;
  return ip || user || "";
}

/** Longest command preview a widget can show without wrapping awkwardly. */
const SNIPPET_PREVIEW_LIMIT = 48;

/**
 * Collapses a snippet body to a single line. Multi-line scripts show their
 * first meaningful line with an ellipsis so the widget hints at the content
 * without dumping a script onto the home screen.
 */
export function snippetPreview(content: string | undefined): string {
  const lines = (content ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return "";

  const first = lines[0].replace(/\s+/g, " ");
  const truncated =
    first.length > SNIPPET_PREVIEW_LIMIT
      ? `${first.slice(0, SNIPPET_PREVIEW_LIMIT - 1)}…`
      : first;
  return lines.length > 1 ? `${truncated} …` : truncated;
}

/**
 * Same ordering the backend uses (`sortSnippets` in the server's snippets
 * route): unfiled snippets first, then folder name, then the user's manual
 * order — so the widget matches the list inside the app.
 */
function compareSnippets(a: Snippet, b: Snippet): number {
  const aFolder = a.folder || "";
  const bFolder = b.folder || "";
  if (!aFolder && bFolder) return -1;
  if (aFolder && !bFolder) return 1;
  if (aFolder !== bFolder) return aFolder.localeCompare(bFolder);
  return (a.order ?? 0) - (b.order ?? 0);
}

function toSnippetEntry(
  snippet: Snippet,
  preferences: WidgetPreferences,
): WidgetSnippetEntry {
  const name = (snippet.name ?? "").trim();
  return {
    id: snippet.id,
    name: name || `Snippet ${snippet.id}`,
    folder: (snippet.folder ?? "").trim(),
    preview: preferences.showSnippetPreview
      ? snippetPreview(snippet.content)
      : "",
    url: buildWidgetSnippetLink(snippet.id),
  };
}

function toEntry(
  host: SSHHost,
  status: WidgetHostStatus,
  metrics: WidgetMetricsEntry | undefined,
  preferences: WidgetPreferences,
): WidgetHostEntry {
  return {
    id: host.id,
    name: hostDisplayName(host),
    subtitle: hostSubtitle(host, preferences.showAddresses),
    folder: (host.folder ?? "").trim(),
    status,
    cpu: normalizePercent(metrics?.cpu),
    mem: normalizePercent(metrics?.ram),
    pinned: Boolean(host.pin),
    url: buildWidgetLink(host.id, "terminal"),
  };
}

/**
 * Ordering shown on the home screen: pinned first, then by status
 * (online → unknown → offline), then alphabetically. Stable and predictable so
 * the widget doesn't reshuffle on every refresh.
 */
function compareEntries(a: WidgetHostEntry, b: WidgetHostEntry): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (rank !== 0) return rank;
  const byName = a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
  });
  if (byName !== 0) return byName;
  return a.id - b.id;
}

function summarize(entries: WidgetHostEntry[]): WidgetSummary {
  return entries.reduce<WidgetSummary>(
    (acc, entry) => {
      acc.total += 1;
      acc[entry.status] += 1;
      return acc;
    },
    { total: 0, online: 0, offline: 0, unknown: 0 },
  );
}

/** An intentionally blank snapshot — used when signed out or widgets are off. */
export function buildSignedOutSnapshot(
  accent: string,
  now = Date.now(),
): WidgetSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    updatedAt: now,
    state: "signed-out",
    accent,
    server: "",
    summary: { total: 0, online: 0, offline: 0, unknown: 0 },
    hosts: [],
    snippets: [],
  };
}

/**
 * Builds the widget payload. Never throws: malformed hosts are skipped rather
 * than taking down the caller's refresh path.
 */
export function buildWidgetSnapshot(input: BuildSnapshotInput): WidgetSnapshot {
  const {
    hosts,
    snippets = [],
    statuses,
    metrics = {},
    preferences = DEFAULT_WIDGET_PREFERENCES,
    accent,
    serverUrl,
    authenticated,
    now = Date.now(),
  } = input;

  if (!authenticated || !preferences.enabled) {
    return buildSignedOutSnapshot(accent, now);
  }

  const safeHosts = Array.isArray(hosts) ? hosts : [];

  // The summary counts every host the user has, even those the preferences
  // filter out of the list — "3 of 12 online" should stay truthful.
  const allEntries = safeHosts
    .filter((host) => host && typeof host.id === "number")
    .map((host) =>
      toEntry(host, hostStatus(host, statuses), metrics[host.id], preferences),
    );

  const summary = summarize(allEntries);

  const visible = allEntries
    .filter((entry) => (preferences.pinnedOnly ? entry.pinned : true))
    .filter((entry) =>
      preferences.includeOffline ? true : entry.status === "online",
    )
    .sort(compareEntries)
    .slice(0, MAX_SNAPSHOT_HOSTS);

  const visibleSnippets = preferences.includeSnippets
    ? (Array.isArray(snippets) ? snippets : [])
        .filter((snippet) => snippet && typeof snippet.id === "number")
        .slice()
        .sort(compareSnippets)
        .slice(0, MAX_SNAPSHOT_SNIPPETS)
        .map((snippet) => toSnippetEntry(snippet, preferences))
    : [];

  return {
    version: SNAPSHOT_VERSION,
    updatedAt: now,
    state: visible.length > 0 || visibleSnippets.length > 0 ? "ready" : "empty",
    accent,
    server: formatServerLabel(serverUrl),
    summary,
    hosts: visible,
    snippets: visibleSnippets,
  };
}

/**
 * True when two snapshots would render identically. Used to skip redundant
 * writes (each write wakes the widget host and costs battery).
 */
export function isSnapshotEquivalent(
  a: WidgetSnapshot | null,
  b: WidgetSnapshot | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  // `updatedAt` is deliberately excluded: it changes on every refresh and would
  // defeat the comparison.
  const strip = (snapshot: WidgetSnapshot) => ({
    ...snapshot,
    updatedAt: 0,
  });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}
