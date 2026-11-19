import { plainStore } from "@/core/storage/kv";
import type { AlertSeverity } from "@/core/api/modules/alerts";

const PREFS_KEY = "push.prefs";

export interface PushPref {
  enabled: boolean;
  minSeverity: AlertSeverity;
  /** The server knows this phone, so turning off has to tell it. */
  registered?: boolean;
  /** Newest alert id already shown, for the F-Droid background check. */
  lastSeenId?: number;
}

export const DEFAULT_PREF: PushPref = {
  enabled: false,
  minSeverity: "warning",
};

let cache: Record<string, PushPref> | null = null;
const listeners = new Set<() => void>();

async function load(): Promise<Record<string, PushPref>> {
  if (!cache) {
    cache =
      (await plainStore.getJson<Record<string, PushPref>>(PREFS_KEY)) ?? {};
  }
  return cache;
}

export async function getPushPref(accountId: string): Promise<PushPref> {
  return { ...DEFAULT_PREF, ...(await load())[accountId] };
}

export async function savePushPref(
  accountId: string,
  patch: Partial<PushPref>,
): Promise<PushPref> {
  const all = await load();
  const next = { ...DEFAULT_PREF, ...all[accountId], ...patch };
  cache = { ...all, [accountId]: next };
  await plainStore.setJson(PREFS_KEY, cache);
  listeners.forEach((l) => l());
  return next;
}

export async function dropPushPref(accountId: string): Promise<void> {
  const all = await load();
  if (!(accountId in all)) return;
  const { [accountId]: _gone, ...rest } = all;
  cache = rest;
  await plainStore.setJson(PREFS_KEY, cache);
  listeners.forEach((l) => l());
}

export function onPushPrefsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam. */
export function resetPushPrefsCache(): void {
  cache = null;
}

const RANK: Record<string, number> = {
  info: 0,
  success: 0,
  warning: 1,
  critical: 2,
};

export function meetsSeverity(severity: string, min: AlertSeverity): boolean {
  return (RANK[severity] ?? 0) >= RANK[min];
}
