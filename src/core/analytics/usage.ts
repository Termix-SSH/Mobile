import { plainStore } from "@/core/storage/kv";
import { FEATURE_KEY, MAX_FEATURES } from "./events";
import { getConsent } from "./consent";

/** Counts kept on the phone until the next report. No names, only counters. */
export interface UsageCounts {
  features: Record<string, number>;
  /** "transport|result" to count. */
  connects: Record<string, number>;
  maxSessions: number;
  lastSentAt: number;
}

const KEY = "analytics.usage.v1";
const MAX_COUNT = 100_000;

const empty = (): UsageCounts => ({
  features: {},
  connects: {},
  maxSessions: 0,
  lastSentAt: 0,
});

let counts: UsageCounts = empty();
let loaded = false;

function clamp(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? Math.min(v, MAX_COUNT) : 0;
}

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const saved = await plainStore.getJson<Partial<UsageCounts>>(KEY);
  const next = empty();
  if (saved && typeof saved === "object") {
    for (const [k, v] of Object.entries(saved.features ?? {})) {
      if (FEATURE_KEY.test(k) && clamp(v)) next.features[k] = clamp(v);
    }
    for (const [k, v] of Object.entries(saved.connects ?? {})) {
      if (/^(local|relay)\|[A-Za-z]{2,12}$/.test(k) && clamp(v)) {
        next.connects[k] = clamp(v);
      }
    }
    next.maxSessions = clamp(saved.maxSessions);
    next.lastSentAt = clamp(saved.lastSentAt) ? Number(saved.lastSentAt) : 0;
  }
  // Counts made before the load finished are kept.
  for (const [k, v] of Object.entries(counts.features)) {
    next.features[k] = Math.min((next.features[k] ?? 0) + v, MAX_COUNT);
  }
  for (const [k, v] of Object.entries(counts.connects)) {
    next.connects[k] = Math.min((next.connects[k] ?? 0) + v, MAX_COUNT);
  }
  next.maxSessions = Math.max(next.maxSessions, counts.maxSessions);
  counts = next;
}

async function save() {
  await plainStore.setJson(KEY, counts);
}

/** A feature tab was opened. Only known feature keys are counted. */
export async function recordFeature(key: string): Promise<void> {
  if (getConsent() !== "on" || !FEATURE_KEY.test(key)) return;
  await ensureLoaded();
  if (
    !(key in counts.features) &&
    Object.keys(counts.features).length >= MAX_FEATURES
  ) {
    return;
  }
  counts.features[key] = Math.min((counts.features[key] ?? 0) + 1, MAX_COUNT);
  await save();
}

export async function recordConnect(
  transport: string,
  result: string,
): Promise<void> {
  if (getConsent() !== "on") return;
  if (transport !== "local" && transport !== "relay") return;
  if (!/^[A-Za-z]{2,12}$/.test(result)) return;
  await ensureLoaded();
  const key = `${transport}|${result}`;
  counts.connects[key] = Math.min((counts.connects[key] ?? 0) + 1, MAX_COUNT);
  await save();
}

/** The most sessions open at once since the last report. */
export async function noteSessions(open: number): Promise<void> {
  if (getConsent() !== "on") return;
  await ensureLoaded();
  const n = clamp(open);
  if (n <= counts.maxSessions) return;
  counts.maxSessions = n;
  await save();
}

export async function readUsage(): Promise<UsageCounts> {
  await ensureLoaded();
  return structuredClone(counts);
}

/** Removes what was reported, keeping anything counted while it was sent. */
export async function clearReported(
  sent: UsageCounts,
  at: number,
): Promise<void> {
  await ensureLoaded();
  for (const [k, v] of Object.entries(sent.features)) {
    const left = (counts.features[k] ?? 0) - v;
    if (left > 0) counts.features[k] = left;
    else delete counts.features[k];
  }
  for (const [k, v] of Object.entries(sent.connects)) {
    const left = (counts.connects[k] ?? 0) - v;
    if (left > 0) counts.connects[k] = left;
    else delete counts.connects[k];
  }
  counts.maxSessions = 0;
  counts.lastSentAt = at;
  await save();
}

/** Opt out forgets everything counted. */
export async function clearUsage(): Promise<void> {
  counts = { ...empty(), lastSentAt: counts.lastSentAt };
  loaded = true;
  await plainStore.remove(KEY);
}

/** For tests. */
export function resetUsageState(): void {
  counts = empty();
  loaded = false;
}
