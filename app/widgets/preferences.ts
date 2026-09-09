/**
 * Widget preferences — persisted in AsyncStorage and shared between the
 * Settings screen (which edits them) and the Hosts screen (which publishes
 * snapshots shaped by them).
 *
 * Kept deliberately tiny: a cached value, a load, a save, and a subscription so
 * a change in Settings takes effect on the next publish without a remount.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_WIDGET_PREFERENCES, type WidgetPreferences } from "./types";

const STORAGE_KEY = "widgetPreferences";

type Listener = (preferences: WidgetPreferences) => void;

let cached: WidgetPreferences = DEFAULT_WIDGET_PREFERENCES;
let loaded = false;
let inFlight: Promise<WidgetPreferences> | null = null;
const listeners = new Set<Listener>();

/** Coerces unknown persisted JSON into a complete, valid preferences object. */
function normalize(value: unknown): WidgetPreferences {
  if (!value || typeof value !== "object") return DEFAULT_WIDGET_PREFERENCES;
  const raw = value as Partial<Record<keyof WidgetPreferences, unknown>>;
  const pick = (key: keyof WidgetPreferences): boolean =>
    typeof raw[key] === "boolean"
      ? (raw[key] as boolean)
      : DEFAULT_WIDGET_PREFERENCES[key];
  return {
    enabled: pick("enabled"),
    showAddresses: pick("showAddresses"),
    includeOffline: pick("includeOffline"),
    pinnedOnly: pick("pinnedOnly"),
    includeSnippets: pick("includeSnippets"),
    showSnippetPreview: pick("showSnippetPreview"),
  };
}

/** Last known preferences without touching storage. Safe on the render path. */
export function getCachedWidgetPreferences(): WidgetPreferences {
  return cached;
}

/** Loads preferences once and memoizes them. Falls back to defaults on error. */
export async function loadWidgetPreferences(): Promise<WidgetPreferences> {
  if (loaded) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      cached = stored
        ? normalize(JSON.parse(stored))
        : DEFAULT_WIDGET_PREFERENCES;
    } catch {
      cached = DEFAULT_WIDGET_PREFERENCES;
    } finally {
      loaded = true;
      inFlight = null;
    }
    return cached;
  })();

  return inFlight;
}

/** Merges a patch into the stored preferences and notifies subscribers. */
export async function saveWidgetPreferences(
  patch: Partial<WidgetPreferences>,
): Promise<WidgetPreferences> {
  await loadWidgetPreferences();
  const next = normalize({ ...cached, ...patch });
  cached = next;
  loaded = true;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Persisting is best-effort; the in-memory value still applies this session.
  }
  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch {
      // A misbehaving subscriber must not break the others.
    }
  });
  return next;
}

/** Subscribes to preference changes. Returns an unsubscribe function. */
export function subscribeToWidgetPreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
