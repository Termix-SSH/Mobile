import { useEffect, useSyncExternalStore } from "react";
import { plainStore } from "@/core/storage/kv";

/** One card's place on Home. `key` is the card id, or `id:instance`. */
export interface HomeSlot {
  key: string;
  hidden: boolean;
}

export interface HomeLayout {
  version: 1;
  slots: HomeSlot[];
}

/** What Home can show right now. */
export interface HomeEntry {
  key: string;
  order: number;
  defaultOn: boolean;
}

const storageKey = (accountId: string) => `home.layout.${accountId}`;

/** Bad or old saved data comes back as null, which means the default. */
export function parseLayout(value: unknown): HomeLayout | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { version?: unknown; slots?: unknown };
  if (raw.version !== 1 || !Array.isArray(raw.slots)) return null;
  const seen = new Set<string>();
  const slots: HomeSlot[] = [];
  for (const slot of raw.slots) {
    if (!slot || typeof slot !== "object") continue;
    const { key, hidden } = slot as { key?: unknown; hidden?: unknown };
    if (typeof key !== "string" || !key || seen.has(key)) continue;
    seen.add(key);
    slots.push({ key, hidden: hidden === true });
  }
  return { version: 1, slots };
}

/**
 * Saved order first, then cards the layout has never seen in their own
 * order. Saved cards that aren't there right now are skipped, not dropped.
 */
export function resolveLayout<T extends HomeEntry>(
  saved: HomeLayout | null,
  entries: T[],
): { entry: T; hidden: boolean }[] {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const out: { entry: T; hidden: boolean }[] = [];
  const placed = new Set<string>();
  for (const slot of saved?.slots ?? []) {
    const entry = byKey.get(slot.key);
    if (!entry) continue;
    out.push({ entry, hidden: slot.hidden });
    placed.add(slot.key);
  }
  const fresh = entries
    .filter((e) => !placed.has(e.key))
    .sort((a, b) => a.order - b.order);
  for (const entry of fresh) out.push({ entry, hidden: !entry.defaultOn });
  return out;
}

/**
 * The layout to save after an edit: the edited cards in their new order,
 * then saved cards that weren't shown, so they come back when available.
 */
export function mergeLayout(
  saved: HomeLayout | null,
  edited: HomeSlot[],
): HomeLayout {
  const keys = new Set(edited.map((s) => s.key));
  const kept = (saved?.slots ?? []).filter((s) => !keys.has(s.key));
  return { version: 1, slots: [...edited, ...kept] };
}

// One cached layout per account, shared by every Home that is mounted.
const cache = new Map<string, HomeLayout | null>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function load(accountId: string) {
  if (cache.has(accountId) || loading.has(accountId)) return;
  loading.add(accountId);
  try {
    const value = await plainStore.getJson<unknown>(storageKey(accountId));
    cache.set(accountId, parseLayout(value));
  } catch {
    cache.set(accountId, null);
  } finally {
    loading.delete(accountId);
    emit();
  }
}

export async function saveHomeLayout(
  accountId: string,
  layout: HomeLayout | null,
): Promise<void> {
  cache.set(accountId, layout);
  emit();
  if (layout) await plainStore.setJson(storageKey(accountId), layout);
  else await plainStore.remove(storageKey(accountId));
}

/** The saved layout, and whether it has loaded yet. */
export function useHomeLayout(accountId: string): {
  layout: HomeLayout | null;
  loaded: boolean;
} {
  useEffect(() => {
    void load(accountId);
  }, [accountId]);
  const loaded = useSyncExternalStore(subscribe, () => cache.has(accountId));
  const layout = useSyncExternalStore(
    subscribe,
    () => cache.get(accountId) ?? null,
  );
  return { layout, loaded };
}

/** Test seam. */
export function clearHomeLayoutCache(): void {
  cache.clear();
  loading.clear();
}
