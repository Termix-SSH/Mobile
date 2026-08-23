/**
 * Publishing pipeline for home-screen widgets.
 *
 * Callers hand over the data they already have — the Hosts screen supplies
 * hosts/statuses/metrics, the Snippets screen supplies snippets — and this
 * module keeps the merged picture, applies preferences, dedupes, and performs
 * the native hand-off.
 *
 * Every entry point is fire-and-forget safe: nothing here throws, so a widget
 * problem can never break a refresh elsewhere in the app.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearWidgetSnapshot,
  isWidgetSupported,
  setWidgetSnapshotJson,
} from "@/modules/termix-widgets";
import { DEFAULT_ACCENT, STORAGE_KEYS } from "@/app/constants/theme";
import { systemLogger } from "@/lib/frontend-logger";
import type { SSHHost, ServerStatus, Snippet } from "@/types";
import {
  buildSignedOutSnapshot,
  buildWidgetSnapshot,
  isSnapshotEquivalent,
  type WidgetMetricsEntry,
} from "./snapshot";
import { loadWidgetPreferences } from "./preferences";
import type { WidgetSnapshot } from "./types";

/**
 * Minimum gap between writes that carry the same content. Widget hosts wake a
 * process on every write, so we avoid re-publishing an unchanged payload more
 * often than this even when a screen refreshes aggressively.
 */
const UNCHANGED_REPUBLISH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Everything needed to rebuild a snapshot, merged from whichever screen last
 * reported. Held in memory only — it is rebuilt on the next refresh after a
 * cold start.
 */
interface SnapshotSource {
  hosts: SSHHost[];
  statuses: Record<number, ServerStatus>;
  metrics: Record<number, WidgetMetricsEntry>;
  snippets: Snippet[];
  serverUrl: string | null;
  authenticated: boolean;
}

const EMPTY_SOURCE: SnapshotSource = {
  hosts: [],
  statuses: {},
  metrics: {},
  snippets: [],
  serverUrl: null,
  authenticated: false,
};

let source: SnapshotSource = EMPTY_SOURCE;
/** Whether any screen has reported data this session. */
let sourcePopulated = false;
let lastPublished: WidgetSnapshot | null = null;
let lastPublishedAt = 0;
/** Serializes writes so two overlapping refreshes can't interleave. */
let writeChain: Promise<void> = Promise.resolve();

/** What the Hosts screen reports on every refresh. */
export interface HostSnapshotInput {
  hosts: SSHHost[];
  statuses: Record<number, ServerStatus>;
  metrics?: Record<number, WidgetMetricsEntry>;
  /** Optional: the Hosts screen fetches snippets alongside hosts. */
  snippets?: Snippet[];
  serverUrl?: string | null;
  authenticated: boolean;
}

/** Reads the persisted accent color, falling back to the brand default. */
async function resolveAccent(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.accent);
    if (stored && /^#[0-9a-fA-F]{6}$/.test(stored.trim())) return stored.trim();
  } catch {
    // fall through to the default
  }
  return DEFAULT_ACCENT;
}

/** Queues work so snapshots are written strictly in call order. */
function enqueue(task: () => Promise<void>): Promise<void> {
  writeChain = writeChain.then(task, task);
  return writeChain;
}

async function write(snapshot: WidgetSnapshot, force: boolean): Promise<void> {
  const unchanged = isSnapshotEquivalent(lastPublished, snapshot);
  const staleEnough =
    Date.now() - lastPublishedAt >= UNCHANGED_REPUBLISH_INTERVAL_MS;
  if (!force && unchanged && !staleEnough) return;

  const delivered = await setWidgetSnapshotJson(JSON.stringify(snapshot));
  if (delivered) {
    lastPublished = snapshot;
    lastPublishedAt = Date.now();
  }
}

/** Rebuilds from the merged source and writes when the result differs. */
async function rebuild(force: boolean): Promise<void> {
  const preferences = await loadWidgetPreferences();
  const accent = await resolveAccent();
  const snapshot = buildWidgetSnapshot({
    hosts: source.hosts,
    snippets: source.snippets,
    statuses: source.statuses,
    metrics: source.metrics,
    preferences,
    accent,
    serverUrl: source.serverUrl,
    authenticated: source.authenticated,
  });
  await write(snapshot, force);
}

function logFailure(message: string, error: unknown): void {
  systemLogger.warn(message, {
    operation: "widgets",
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Publishes the host side of the snapshot. Safe to call on every Hosts
 * refresh — redundant payloads are dropped.
 */
export async function publishHostSnapshot(
  input: HostSnapshotInput,
): Promise<void> {
  if (!isWidgetSupported) return;

  return enqueue(async () => {
    try {
      source = {
        ...source,
        hosts: input.hosts,
        statuses: input.statuses,
        metrics: input.metrics ?? {},
        // Only replace snippets when the caller actually fetched them.
        snippets: input.snippets ?? source.snippets,
        serverUrl: input.serverUrl ?? source.serverUrl,
        authenticated: input.authenticated,
      };
      sourcePopulated = true;
      await rebuild(false);
    } catch (error) {
      logFailure("[widgets] failed to publish snapshot", error);
    }
  });
}

/**
 * Publishes the snippet side of the snapshot, keeping the hosts already
 * reported. Called from the Snippets screen after a load or an edit.
 */
export async function publishSnippetSnapshot(
  snippets: Snippet[],
): Promise<void> {
  if (!isWidgetSupported) return;

  return enqueue(async () => {
    try {
      source = { ...source, snippets, authenticated: true };
      sourcePopulated = true;
      await rebuild(false);
    } catch (error) {
      logFailure("[widgets] failed to publish snippets", error);
    }
  });
}

/**
 * Re-publishes through the current preferences. Called when the user changes a
 * widget setting so the home screen updates immediately.
 */
export async function republishWithPreferences(): Promise<void> {
  if (!isWidgetSupported) return;
  // Nothing has been reported yet (e.g. the user opened Settings before the
  // Hosts screen loaded). Rebuilding now would publish an empty snapshot and
  // blank the widgets; the next refresh will apply the new preferences.
  if (!sourcePopulated) return;
  return enqueue(async () => {
    try {
      await rebuild(true);
    } catch (error) {
      logFailure("[widgets] failed to republish snapshot", error);
    }
  });
}

/**
 * Drops all data from the widgets — sign-out, server change, or the user
 * disabling widgets. Widgets fall back to their "sign in" state.
 */
export async function publishSignedOutSnapshot(): Promise<void> {
  if (!isWidgetSupported) return;
  return enqueue(async () => {
    try {
      source = EMPTY_SOURCE;
      sourcePopulated = false;
      const accent = await resolveAccent();
      await write(buildSignedOutSnapshot(accent), true);
    } catch (error) {
      logFailure("[widgets] failed to clear snapshot", error);
    }
  });
}

/** Removes the stored payload entirely (used on sign-out). */
export async function resetWidgets(): Promise<void> {
  if (!isWidgetSupported) return;
  return enqueue(async () => {
    try {
      source = EMPTY_SOURCE;
      sourcePopulated = false;
      await clearWidgetSnapshot();
      lastPublished = null;
      lastPublishedAt = 0;
    } catch (error) {
      logFailure("[widgets] failed to reset widgets", error);
    }
  });
}

export type { WidgetMetricsEntry };
