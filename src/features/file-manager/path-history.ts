import { plainStore } from "@/core/storage/kv";

// Port of Plugin-File-Manager's lib/path-history.ts, kept per host on the phone.

export interface PathEntry {
  path: string;
  count: number;
  last: number;
}

export interface PathHistory {
  frequent: string[];
  recent: string[];
}

/** Counts a visit to a folder, keeping the newest `limit` folders. */
export function recordVisit(
  entries: PathEntry[],
  path: string,
  limit: number,
  now = Date.now(),
): PathEntry[] {
  if (!path || path === ".") return entries;
  const next = entries.map((e) => ({ ...e }));
  // Always newer than the last visit, so two quick visits keep their order.
  const stamp = Math.max(now, (next[0]?.last ?? 0) + 1);
  const found = next.find((e) => e.path === path);
  if (found) {
    found.count += 1;
    found.last = stamp;
  } else {
    next.push({ path, count: 1, last: stamp });
  }
  next.sort((a, b) => b.last - a.last);
  return next.slice(0, Math.max(1, limit));
}

/** The most visited folders, and the latest ones that are not among them. */
export function splitHistory(
  entries: PathEntry[],
  frequentCount = 5,
): PathHistory {
  const frequent = [...entries]
    .filter((e) => e.count > 1)
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, frequentCount)
    .map((e) => e.path);
  const recent = [...entries]
    .sort((a, b) => b.last - a.last)
    .map((e) => e.path)
    .filter((p) => !frequent.includes(p));
  return { frequent, recent };
}

const key = (hostKey: string) => `files.pathHistory.${hostKey}`;

async function read(hostKey: string): Promise<PathEntry[]> {
  const raw = await plainStore.getJson<PathEntry[]>(key(hostKey));
  return Array.isArray(raw) ? raw : [];
}

export async function recordPath(hostKey: string, path: string, limit: number) {
  await plainStore.setJson(
    key(hostKey),
    recordVisit(await read(hostKey), path, limit),
  );
}

export async function listPaths(hostKey: string): Promise<PathHistory> {
  return splitHistory(await read(hostKey));
}

export async function clearPaths(hostKey: string) {
  await plainStore.remove(key(hostKey));
}
