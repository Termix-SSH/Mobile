import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { accounts } from "@/core/accounts";
import { isServerAccount } from "@/core/accounts/types";
import { hosts } from "@/core/db/schema";
import { localStores, type LocalStores } from "@/core/db/stores";
import { SyncRemote } from "./remote";

/**
 * A linked server's own id for a host. The phone's copy has its own ids, but
 * server actions (the relay terminal, files, docker, ...) need the server's.
 * Shared hosts carry it; owned ones are asked for once and kept on the row.
 * There is no batch lookup yet, see Termix-SSH/Plugin-Sync#4.
 */
export async function serverHostId(
  accountId: string,
  host: { id: number; syncId?: string | null; serverId?: number | null },
  stores: LocalStores = localStores,
): Promise<number> {
  if (typeof host.serverId === "number") return host.serverId;
  const account = accounts.find(accountId);
  if (!isServerAccount(account) || !account.options.sync || !host.syncId) {
    return host.id;
  }
  const { db } = await stores.openForSync(accountId);
  const row = db
    .select({ serverId: hosts.serverId })
    .from(hosts)
    .where(eq(hosts.syncId, host.syncId))
    .get();
  if (typeof row?.serverId === "number") return row.serverId;
  const client = accounts.client(accountId);
  if (!client) return host.id;
  const id = await new SyncRemote(client).hostId(host.syncId);
  if (id === null) return host.id;
  db.update(hosts)
    .set({ serverId: id })
    .where(eq(hosts.syncId, host.syncId))
    .run();
  return id;
}

/** The host with the server's id, for code that talks to the server. */
export async function asServerHost<
  T extends { id: number; syncId?: string | null; serverId?: number | null },
>(accountId: string, host: T, stores?: LocalStores): Promise<T> {
  const id = await serverHostId(accountId, host, stores);
  return id === host.id ? host : { ...host, id, localId: host.id };
}

/** Asks for the server ids of up to `limit` owned hosts that lack one. */
export async function fillServerIds(
  accountId: string,
  limit = 50,
  stores: LocalStores = localStores,
): Promise<number> {
  const client = accounts.client(accountId);
  if (!client) return 0;
  const { db } = await stores.openForSync(accountId);
  const missing = db
    .select({ syncId: hosts.syncId })
    .from(hosts)
    .where(and(isNull(hosts.serverId), isNull(hosts.sharedSource)))
    .limit(limit)
    .all();
  const remote = new SyncRemote(client);
  let filled = 0;
  for (let i = 0; i < missing.length; i += 4) {
    const batch = missing.slice(i, i + 4);
    const ids = await Promise.all(
      batch.map((row) => remote.hostId(row.syncId).catch(() => null)),
    );
    batch.forEach((row, index) => {
      const id = ids[index];
      if (id === null) return;
      db.update(hosts)
        .set({ serverId: id })
        .where(and(eq(hosts.syncId, row.syncId), isNotNull(hosts.syncId)))
        .run();
      filled++;
    });
  }
  return filled;
}

/** Whether the phone keeps its own copy of this account (its ids are local). */
export function isSynced(accountId: string): boolean {
  const account = accounts.find(accountId);
  return isServerAccount(account) && account.options.sync === true;
}

/**
 * The host config the relay terminal sends. The server finds the host by
 * syncId first; the id is swapped for the server's when it can be found.
 */
export async function serverHostConfig<
  T extends { id: number; syncId?: string | null },
>(accountId: string, config: T): Promise<T> {
  if (!isSynced(accountId)) return config;
  try {
    return { ...config, id: await serverHostId(accountId, config) };
  } catch {
    return config;
  }
}

const snippetIds = new Map<string, { at: number; ids: Map<string, number> }>();
const SNIPPET_IDS_TTL_MS = 60_000;

/** A linked server's own id for a snippet, by its syncId. */
export async function serverSnippetId(
  accountId: string,
  snippet: { id: number; syncId?: string | null },
): Promise<number> {
  if (!isSynced(accountId) || !snippet.syncId) return snippet.id;
  let cached = snippetIds.get(accountId);
  if (!cached || Date.now() - cached.at > SNIPPET_IDS_TTL_MS) {
    const client = accounts.client(accountId);
    const raw = client ? await client.api.snippets.getSnippets() : [];
    const list: { id?: unknown; syncId?: unknown }[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.snippets)
        ? raw.snippets
        : [];
    const ids = new Map<string, number>();
    for (const item of list) {
      if (typeof item.syncId === "string" && typeof item.id === "number") {
        ids.set(item.syncId, item.id);
      }
    }
    cached = { at: Date.now(), ids };
    snippetIds.set(accountId, cached);
  }
  return cached.ids.get(snippet.syncId) ?? snippet.id;
}

/**
 * Live host status keyed by the phone's own host ids. A synced account asks
 * /sync/v2/host-status, which is keyed by syncId; others use /status.
 */
export async function hostStatusesByLocalId<T>(
  accountId: string,
  hostList: { id: number; syncId?: string | null }[],
): Promise<Record<number, T>> {
  const client = accounts.client(accountId);
  if (!client) return {};
  if (!isSynced(accountId)) {
    return (await client.api.metrics.getAllServerStatuses()) as Record<
      number,
      T
    >;
  }
  const bySyncId = await new SyncRemote(client).hostStatus<T>();
  const out: Record<number, T> = {};
  for (const host of hostList) {
    const entry = host.syncId ? bySyncId[host.syncId] : undefined;
    if (entry) out[host.id] = entry;
  }
  return out;
}

/** Test seam. */
export function clearSnippetIds(): void {
  snippetIds.clear();
}
