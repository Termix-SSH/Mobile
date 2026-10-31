import { useEffect, useMemo, useState } from "react";
import { accountStorage } from "@/core/storage/kv";
import type { SSHHost } from "@/types";

/** A host someone opened, newest first. No secrets, only ids. */
export interface RecentHost {
  hostId: number;
  syncId?: string | null;
  at: string;
}

const KEY = "recentHosts";
export const RECENT_LIMIT = 10;

const listeners = new Set<(accountId: string) => void>();
const cache = new Map<string, RecentHost[]>();

/** Puts a host at the top of the account's recent list. */
export function addRecent(
  list: RecentHost[],
  host: Pick<SSHHost, "id" | "syncId">,
  at = new Date().toISOString(),
): RecentHost[] {
  const same = (r: RecentHost) =>
    r.hostId === host.id || (!!host.syncId && r.syncId === host.syncId);
  return [
    { hostId: host.id, syncId: host.syncId ?? null, at },
    ...list.filter((r) => !same(r)),
  ].slice(0, RECENT_LIMIT);
}

export async function listRecent(accountId: string): Promise<RecentHost[]> {
  const cached = cache.get(accountId);
  if (cached) return cached;
  try {
    const saved =
      await accountStorage(accountId).data.getJson<RecentHost[]>(KEY);
    const list = Array.isArray(saved) ? saved : [];
    cache.set(accountId, list);
    return list;
  } catch {
    return [];
  }
}

export async function recordRecent(
  accountId: string,
  host: Pick<SSHHost, "id" | "syncId">,
): Promise<void> {
  const next = addRecent(await listRecent(accountId), host);
  cache.set(accountId, next);
  listeners.forEach((l) => l(accountId));
  await accountStorage(accountId)
    .data.setJson(KEY, next)
    .catch(() => {});
}

/** Forgets the recent hosts of one account. */
export async function clearRecent(accountId: string): Promise<void> {
  cache.set(accountId, []);
  listeners.forEach((l) => l(accountId));
  await accountStorage(accountId)
    .data.remove(KEY)
    .catch(() => {});
}

export function subscribeRecent(
  listener: (accountId: string) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Recent entries matched to hosts that still exist, by syncId then id. */
export function resolveRecent(list: RecentHost[], hosts: SSHHost[]): SSHHost[] {
  const bySync = new Map<string, SSHHost>();
  const byId = new Map<number, SSHHost>();
  for (const h of hosts) {
    if (h.syncId) bySync.set(h.syncId, h);
    byId.set(h.id, h);
  }
  const out: SSHHost[] = [];
  for (const r of list) {
    const host = (r.syncId && bySync.get(r.syncId)) || byId.get(r.hostId);
    if (host && !out.includes(host)) out.push(host);
  }
  return out;
}

/** The account's recent hosts out of the given list. */
export function useRecentHosts(accountId: string, hosts: SSHHost[]) {
  const [list, setList] = useState<RecentHost[]>(
    () => cache.get(accountId) ?? [],
  );
  useEffect(() => {
    let live = true;
    const load = () => listRecent(accountId).then((l) => live && setList(l));
    load();
    const off = subscribeRecent((id) => id === accountId && load());
    return () => {
      live = false;
      off();
    };
  }, [accountId]);
  return useMemo(() => resolveRecent(list, hosts), [list, hosts]);
}

/** Test helper: forget cached lists. */
export function clearRecentCache(): void {
  cache.clear();
}
