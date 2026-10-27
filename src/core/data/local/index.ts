import {
  and,
  asc,
  desc,
  eq,
  getTableName,
  gte,
  inArray,
  isNull,
  lt,
  notInArray,
} from "drizzle-orm";
import { randomUUID } from "expo-crypto";
import { AppError } from "@/core/errors";
import { changes } from "@/core/db/changes";
import type { LocalDb } from "@/core/db/driver";
import {
  commandHistory,
  hostPrefs,
  metricSamples,
  credentials,
  folders,
  hostDefaults,
  hosts,
  recentActivity,
  snippetFolders,
  snippets,
} from "@/core/db/schema";
import { localStores, type LocalStores } from "@/core/db/stores";
import {
  overridesAfterEdit,
  planHostDefaults,
  storedOverrides,
} from "@/core/hosts/defaults/apply";
import { leftOutKeys } from "@/core/hosts/defaults/draft";
import { effectiveFolderPath } from "@/core/hosts/defaults/resolve";
import {
  loadDefaultsIndex,
  materializeHosts,
  placementOf,
  setDefault,
  unsetDefault,
} from "@/core/hosts/defaults/store";
import type { SSHHost } from "@/types";
import type { DataRepositories } from "../types";
import {
  credentialFromRow,
  credentialToRow,
  hostFromRow,
  hostToRow,
  parseJson,
  snippetFolderFromRow,
  snippetFromRow,
} from "./mappers";

export const HISTORY_LIMIT = 500;
export const ACTIVITY_LIMIT = 100;

const now = () => new Date().toISOString();
const METRIC_STEP_MS = 60_000;
const METRIC_KEEP_MS = 7 * 24 * 60 * 60_000;

const notFound = (what: string) =>
  new AppError(`That ${what} no longer exists.`, "NOT_FOUND");

/** Shared copies come from the server and only their owner can change them. */
/**
 * Refuses a parent host that is missing, shared, the host itself or one of
 * its own sub-hosts, like core's host-parent-validation.
 */
function checkParent(d: LocalDb, hostId: number | null, parentHostId: number) {
  const links = d
    .select({
      id: hosts.id,
      parentHostId: hosts.parentHostId,
      sharedSource: hosts.sharedSource,
    })
    .from(hosts)
    .all();
  const byId = new Map(links.map((link) => [link.id, link]));
  const parent = byId.get(parentHostId);
  if (hostId !== null && parentHostId === hostId) {
    throw new AppError("A host cannot be its own parent", "VALIDATION_ERROR");
  }
  if (!parent || parent.sharedSource) {
    throw new AppError("Parent host not found", "VALIDATION_ERROR");
  }
  const seen = new Set<number>();
  let current: number | null = parentHostId;
  while (current !== null && !seen.has(current)) {
    if (current === hostId) {
      throw new AppError(
        "A host can't go under one of its own sub-hosts",
        "VALIDATION_ERROR",
      );
    }
    seen.add(current);
    current = byId.get(current)?.parentHostId ?? null;
  }
}

/** The folder whose defaults a host with this placement follows. */
function defaultsFolder(
  d: LocalDb,
  hostId: number | null,
  row: { folder?: string | null; parentHostId?: number | null },
): string | null {
  if (!row.parentHostId) return row.folder || null;
  const placement = placementOf(
    d
      .select({
        id: hosts.id,
        folder: hosts.folder,
        parentHostId: hosts.parentHostId,
      })
      .from(hosts)
      .all(),
  );
  if (hostId !== null) placement.delete(hostId);
  return effectiveFolderPath(
    { folder: row.folder || null, parentHostId: row.parentHostId },
    placement,
  );
}

function refuseShared(row: { sharedSource: string | null }, what: string) {
  if (row.sharedSource) {
    throw new AppError(
      `This ${what} is shared with you. Only its owner can change it.`,
      "ACCESS_DENIED",
    );
  }
}

/** The encrypted store of one account. Every call waits for App Lock. */
export function localRepositories(
  accountId: string,
  stores: LocalStores = localStores,
): DataRepositories {
  const db = async (): Promise<LocalDb> => (await stores.get(accountId)).db;
  // Also fires on unlock, so a list read while locked fills in after.
  const watch =
    (...tables: { _: unknown }[]) =>
    (listener: () => void) => {
      const stopChanges = changes.subscribe(
        accountId,
        tables.map((t) => getTableName(t as never)),
        listener,
      );
      let unlocked = stores.getState().unlocked;
      const stopState = stores.subscribe(() => {
        const next = stores.getState().unlocked;
        if (next && !unlocked) listener();
        unlocked = next;
      });
      return () => {
        stopChanges();
        stopState();
      };
    };
  const touched = (...tables: { _: unknown }[]) =>
    tables.forEach((t) => changes.emit(accountId, getTableName(t as never)));

  // History is keyed by syncId, so it follows the host across devices.
  // Callers that only know the id (the terminal) still land on the syncId.
  const hostKey = (d: LocalDb, host: SSHHost) =>
    host.syncId ||
    d
      .select({ syncId: hosts.syncId })
      .from(hosts)
      .where(eq(hosts.id, host.id))
      .get()?.syncId ||
    `id:${host.id}`;

  let hostList: Promise<SSHHost[]> | null = null;

  return {
    source: "local",
    hosts: {
      subscribe: watch(hosts),
      list() {
        // The widget, Home and Hosts all reload on the same change; they
        // share one read. Only a read still running is shared, so none is stale.
        if (!hostList) {
          hostList = (async () => {
            const rows = (await db()).select().from(hosts).all();
            return rows.map(hostFromRow);
          })().finally(() => {
            hostList = null;
          });
        }
        return hostList.then((list) => list.slice());
      },
      async get(id) {
        const row = (await db())
          .select()
          .from(hosts)
          .where(eq(hosts.id, id))
          .get();
        return row ? hostFromRow(row) : null;
      },
      async create(draft) {
        const d = await db();
        const base = hostToRow(draft, null);
        if (base.parentHostId) checkParent(d, null, base.parentHostId);
        const plan = planHostDefaults({
          columns: base,
          index: loadDefaultsIndex(d),
          folder: defaultsFolder(d, null, base),
          leftOut: leftOutKeys(draft),
          pluginSettings: parseJson(base.pluginSettings, {}),
          fillPlugins: true,
        });
        const row = d
          .insert(hosts)
          .values({
            ...plan.columns,
            pluginSettings: JSON.stringify(plan.pluginSettings),
            defaultOverrides: JSON.stringify(plan.overrides),
            syncId: randomUUID(),
          } as typeof base & { syncId: string })
          .returning()
          .get();
        touched(hosts);
        return hostFromRow(row);
      },
      async update(id, draft) {
        const d = await db();
        const current = d.select().from(hosts).where(eq(hosts.id, id)).get();
        if (!current) throw notFound("host");
        refuseShared(current, "host");
        const next = hostToRow(draft, current);
        if (next.parentHostId && next.parentHostId !== current.parentHostId) {
          checkParent(d, id, next.parentHostId);
        }
        const plan = planHostDefaults({
          columns: next,
          index: loadDefaultsIndex(d),
          folder: defaultsFolder(d, id, next),
          hostId: id,
          overrides: overridesAfterEdit(
            storedOverrides(current.defaultOverrides),
            current as never,
            next,
          ),
          pluginSettings: parseJson(next.pluginSettings, {}),
        });
        const row = d
          .update(hosts)
          .set({
            ...plan.columns,
            pluginSettings: JSON.stringify(plan.pluginSettings),
            defaultOverrides: JSON.stringify(plan.overrides),
            updatedAt: now(),
          } as typeof next)
          .where(eq(hosts.id, id))
          .returning()
          .get();
        touched(hosts);
        return hostFromRow(row);
      },
      async remove(id) {
        const d = await db();
        const current = d.select().from(hosts).where(eq(hosts.id, id)).get();
        if (current) refuseShared(current, "host");
        d.delete(hosts).where(eq(hosts.id, id)).run();
        touched(hosts);
      },
      async reorder(positions) {
        const d = await db();
        const at = now();
        d.transaction((tx) => {
          for (const { id, sortOrder } of positions) {
            tx.update(hosts)
              .set({ sortOrder, updatedAt: at })
              .where(and(eq(hosts.id, id), isNull(hosts.sharedSource)))
              .run();
          }
        });
        touched(hosts);
      },
      async bulkUpdate(ids, updates) {
        const set: Partial<typeof hosts.$inferInsert> = { updatedAt: now() };
        if (updates.pin !== undefined) set.pin = updates.pin;
        if (updates.folder !== undefined) {
          set.folder = updates.folder.trim() || null;
          // A host sits in a folder or under a parent host, never both.
          set.parentHostId = null;
        }
        if (ids.length === 0) return;
        const d = await db();
        if (updates.parentHostId != null) {
          for (const id of ids) checkParent(d, id, updates.parentHostId);
          set.parentHostId = updates.parentHostId;
          set.folder = null;
        } else if (updates.parentHostId === null) {
          set.parentHostId = null;
        }
        d.update(hosts)
          .set(set)
          .where(and(inArray(hosts.id, ids), isNull(hosts.sharedSource)))
          .run();
        // A new place can mean other folder defaults, like core's recompute.
        if ("parentHostId" in set) materializeHosts(d);
        touched(hosts);
      },
    },

    hostFolders: {
      subscribe: watch(folders, hosts),
      async list() {
        return (await db())
          .select()
          .from(folders)
          .orderBy(asc(folders.sortOrder), asc(folders.name))
          .all()
          .map((f) => ({
            name: f.name,
            color: f.color ?? undefined,
            icon: f.icon ?? undefined,
          }));
      },
    },

    credentials: {
      subscribe: watch(credentials),
      async list() {
        return (await db())
          .select()
          .from(credentials)
          .orderBy(asc(credentials.name))
          .all()
          .map(credentialFromRow);
      },
      async get(id) {
        const row = (await db())
          .select()
          .from(credentials)
          .where(eq(credentials.id, id))
          .get();
        return row ? credentialFromRow(row) : null;
      },
      async create(draft) {
        if (!draft.name?.trim()) {
          throw new AppError("Name is required", "VALIDATION_ERROR");
        }
        const row = (await db())
          .insert(credentials)
          .values({ ...credentialToRow(draft, null), syncId: randomUUID() })
          .returning()
          .get();
        touched(credentials);
        return credentialFromRow(row);
      },
      async update(id, draft) {
        const d = await db();
        const current = d
          .select()
          .from(credentials)
          .where(eq(credentials.id, id))
          .get();
        if (!current) throw notFound("login");
        refuseShared(current, "login");
        const row = d
          .update(credentials)
          .set({ ...credentialToRow(draft, current), updatedAt: now() })
          .where(eq(credentials.id, id))
          .returning()
          .get();
        touched(credentials);
        return credentialFromRow(row);
      },
      async remove(id) {
        const d = await db();
        const current = d
          .select()
          .from(credentials)
          .where(eq(credentials.id, id))
          .get();
        if (current) refuseShared(current, "login");
        d.delete(credentials).where(eq(credentials.id, id)).run();
        // Hosts that used it lose the link (on delete set null).
        touched(credentials, hosts);
      },
    },

    snippets: {
      subscribe: watch(snippets),
      async list() {
        return (await db())
          .select()
          .from(snippets)
          .orderBy(asc(snippets.order), asc(snippets.name))
          .all()
          .map(snippetFromRow);
      },
      async get(id) {
        const row = (await db())
          .select()
          .from(snippets)
          .where(eq(snippets.id, id))
          .get();
        return row ? snippetFromRow(row) : null;
      },
      async create(draft) {
        if (!draft.name?.trim() || !draft.content) {
          throw new AppError(
            "Name and command are required",
            "VALIDATION_ERROR",
          );
        }
        const row = (await db())
          .insert(snippets)
          .values({
            syncId: randomUUID(),
            name: draft.name.trim(),
            content: draft.content,
            description: draft.description || null,
            folder: draft.folder || null,
            order: draft.order ?? 0,
            hostFilter: draft.hostFilter || null,
            isNote: Boolean(draft.isNote),
          })
          .returning()
          .get();
        touched(snippets);
        return snippetFromRow(row);
      },
      async update(id, draft) {
        const d = await db();
        const current = d
          .select()
          .from(snippets)
          .where(eq(snippets.id, id))
          .get();
        if (!current) throw notFound("snippet");
        const row = d
          .update(snippets)
          .set({
            name: draft.name?.trim() || current.name,
            content: draft.content ?? current.content,
            description:
              draft.description === undefined
                ? current.description
                : draft.description || null,
            folder:
              draft.folder === undefined
                ? current.folder
                : draft.folder || null,
            order: draft.order ?? current.order,
            hostFilter:
              draft.hostFilter === undefined
                ? current.hostFilter
                : draft.hostFilter || null,
            isNote: draft.isNote ?? current.isNote,
            updatedAt: now(),
          })
          .where(eq(snippets.id, id))
          .returning()
          .get();
        touched(snippets);
        return snippetFromRow(row);
      },
      async remove(id) {
        (await db()).delete(snippets).where(eq(snippets.id, id)).run();
        touched(snippets);
      },
      async reorder(items) {
        const d = await db();
        d.transaction((tx) => {
          for (const item of items) {
            tx.update(snippets)
              .set({
                order: item.order,
                ...(item.folder !== undefined
                  ? { folder: item.folder || null }
                  : {}),
                updatedAt: now(),
              })
              .where(eq(snippets.id, item.id))
              .run();
          }
        });
        touched(snippets);
      },
    },

    snippetFolders: {
      subscribe: watch(snippetFolders, snippets),
      async list() {
        return (await db())
          .select()
          .from(snippetFolders)
          .orderBy(asc(snippetFolders.name))
          .all()
          .map(snippetFolderFromRow);
      },
      async create(folder) {
        const name = folder.name.trim();
        if (!name) throw new AppError("Name is required", "VALIDATION_ERROR");
        const d = await db();
        const exists = d
          .select()
          .from(snippetFolders)
          .where(eq(snippetFolders.name, name))
          .get();
        if (exists) {
          throw new AppError("A folder with that name exists", "CONFLICT");
        }
        d.insert(snippetFolders)
          .values({
            syncId: randomUUID(),
            name,
            color: folder.color ?? null,
            icon: folder.icon ?? null,
          })
          .run();
        touched(snippetFolders);
      },
      async rename(oldName, newName) {
        const name = newName.trim();
        if (!name) throw new AppError("Name is required", "VALIDATION_ERROR");
        const d = await db();
        d.transaction((tx) => {
          tx.update(snippetFolders)
            .set({ name, updatedAt: now() })
            .where(eq(snippetFolders.name, oldName))
            .run();
          tx.update(snippets)
            .set({ folder: name, updatedAt: now() })
            .where(eq(snippets.folder, oldName))
            .run();
        });
        touched(snippetFolders, snippets);
      },
      async remove(name) {
        const d = await db();
        d.transaction((tx) => {
          tx.delete(snippetFolders).where(eq(snippetFolders.name, name)).run();
          tx.update(snippets)
            .set({ folder: null, updatedAt: now() })
            .where(eq(snippets.folder, name))
            .run();
        });
        touched(snippetFolders, snippets);
      },
    },

    hostPrefs: {
      subscribe: watch(hostPrefs),
      async get(host, key) {
        const d = await db();
        return (
          d
            .select({ value: hostPrefs.value })
            .from(hostPrefs)
            .where(
              and(
                eq(hostPrefs.hostSyncId, hostKey(d, host)),
                eq(hostPrefs.key, key),
              ),
            )
            .get()?.value ?? null
        );
      },
      async set(host, key, value) {
        const d = await db();
        const hostSyncId = hostKey(d, host);
        if (value === null) {
          d.delete(hostPrefs)
            .where(
              and(eq(hostPrefs.hostSyncId, hostSyncId), eq(hostPrefs.key, key)),
            )
            .run();
        } else {
          d.insert(hostPrefs)
            .values({ hostSyncId, key, value, updatedAt: now() })
            .onConflictDoUpdate({
              target: [hostPrefs.hostSyncId, hostPrefs.key],
              set: { value, updatedAt: now() },
            })
            .run();
        }
        touched(hostPrefs);
      },
    },

    metricSamples: {
      async append(host, point) {
        const d = await db();
        const hostSyncId = hostKey(d, host);
        const last = d
          .select({ ts: metricSamples.ts })
          .from(metricSamples)
          .where(eq(metricSamples.hostSyncId, hostSyncId))
          .orderBy(desc(metricSamples.ts))
          .limit(1)
          .get();
        if (last && point.ts - last.ts < METRIC_STEP_MS) return;
        d.transaction((tx) => {
          tx.insert(metricSamples)
            .values({ hostSyncId, ...point })
            .run();
          tx.delete(metricSamples)
            .where(lt(metricSamples.ts, point.ts - METRIC_KEEP_MS))
            .run();
        });
      },
      async range(host, fromTs) {
        const d = await db();
        return d
          .select({
            ts: metricSamples.ts,
            cpu: metricSamples.cpu,
            mem: metricSamples.mem,
            disk: metricSamples.disk,
            rx: metricSamples.rx,
            tx: metricSamples.tx,
          })
          .from(metricSamples)
          .where(
            and(
              eq(metricSamples.hostSyncId, hostKey(d, host)),
              gte(metricSamples.ts, fromTs),
            ),
          )
          .orderBy(asc(metricSamples.ts))
          .all();
      },
    },

    hostDefaults: {
      subscribe: watch(hostDefaults, hosts, folders),
      async index() {
        return loadDefaultsIndex(await db());
      },
      async set(target, fullKey, value) {
        const d = await db();
        d.transaction((tx) => {
          // Classify first, so a host holding the old default keeps following it.
          materializeHosts(tx as never);
          setDefault(tx as never, target, fullKey, value);
          materializeHosts(tx as never);
        });
        touched(hostDefaults, hosts);
      },
      async unset(target, fullKey) {
        const d = await db();
        d.transaction((tx) => {
          materializeHosts(tx as never);
          unsetDefault(tx as never, target, fullKey);
          materializeHosts(tx as never);
        });
        touched(hostDefaults, hosts);
      },
    },

    commandHistory: {
      subscribe: watch(commandHistory),
      async list(host) {
        const d = await db();
        return d
          .select({ command: commandHistory.command })
          .from(commandHistory)
          .where(eq(commandHistory.hostSyncId, hostKey(d, host)))
          .orderBy(desc(commandHistory.usedAt), desc(commandHistory.id))
          .limit(HISTORY_LIMIT)
          .all()
          .map((row) => row.command);
      },
      async add(host, command) {
        const text = command.trim();
        if (!text) return;
        const d = await db();
        const key = hostKey(d, host);
        d.transaction((tx) => {
          tx.insert(commandHistory)
            .values({ hostSyncId: key, command: text, usedAt: now() })
            .onConflictDoUpdate({
              target: [commandHistory.hostSyncId, commandHistory.command],
              set: { usedAt: now() },
            })
            .run();
          const keep = tx
            .select({ id: commandHistory.id })
            .from(commandHistory)
            .where(eq(commandHistory.hostSyncId, key))
            .orderBy(desc(commandHistory.usedAt), desc(commandHistory.id))
            .limit(HISTORY_LIMIT)
            .all()
            .map((row) => row.id);
          tx.delete(commandHistory)
            .where(
              and(
                eq(commandHistory.hostSyncId, key),
                notInArray(commandHistory.id, keep),
              ),
            )
            .run();
        });
        touched(commandHistory);
      },
      async merge(host, commands) {
        const d = await db();
        const key = hostKey(d, host);
        const have = new Set(
          d
            .select({ command: commandHistory.command })
            .from(commandHistory)
            .where(eq(commandHistory.hostSyncId, key))
            .all()
            .map((row) => row.command),
        );
        const oldest = d
          .select({ usedAt: commandHistory.usedAt })
          .from(commandHistory)
          .where(eq(commandHistory.hostSyncId, key))
          .orderBy(asc(commandHistory.usedAt))
          .limit(1)
          .get();
        const missing = [...new Set(commands.map((c) => c.trim()))]
          .filter((c) => c && !have.has(c))
          .slice(0, Math.max(0, HISTORY_LIMIT - have.size));
        if (missing.length === 0) return;
        // Older than anything here, newest of the merged ones first.
        const parsed = oldest ? Date.parse(oldest.usedAt) : NaN;
        const base = Number.isFinite(parsed) ? parsed : Date.now();
        d.transaction((tx) => {
          missing.forEach((command, i) => {
            tx.insert(commandHistory)
              .values({
                hostSyncId: key,
                command,
                usedAt: new Date(base - (i + 1) * 1000).toISOString(),
              })
              .onConflictDoNothing()
              .run();
          });
        });
        touched(commandHistory);
      },
      async remove(host, command) {
        const d = await db();
        d.delete(commandHistory)
          .where(
            and(
              eq(commandHistory.hostSyncId, hostKey(d, host)),
              eq(commandHistory.command, command),
            ),
          )
          .run();
        touched(commandHistory);
      },
      async clear(host) {
        const d = await db();
        d.delete(commandHistory)
          .where(eq(commandHistory.hostSyncId, hostKey(d, host)))
          .run();
        touched(commandHistory);
      },
    },

    recentActivity: {
      subscribe: watch(recentActivity),
      async list(limit = 20) {
        return (await db())
          .select()
          .from(recentActivity)
          .orderBy(desc(recentActivity.at), desc(recentActivity.id))
          .limit(limit)
          .all()
          .map((row) => ({
            kind: row.kind,
            title: row.title,
            hostSyncId: row.hostSyncId,
            at: row.at,
          }));
      },
      async add(entry) {
        const d = await db();
        d.transaction((tx) => {
          tx.insert(recentActivity)
            .values({
              kind: entry.kind,
              title: entry.title,
              hostSyncId: entry.hostSyncId ?? null,
              at: now(),
            })
            .run();
          const keep = tx
            .select({ id: recentActivity.id })
            .from(recentActivity)
            .orderBy(desc(recentActivity.at), desc(recentActivity.id))
            .limit(ACTIVITY_LIMIT)
            .all()
            .map((row) => row.id);
          tx.delete(recentActivity)
            .where(notInArray(recentActivity.id, keep))
            .run();
        });
        touched(recentActivity);
      },
    },

    origins: {
      async get(host) {
        const row = (await db())
          .select({ pluginSettings: hosts.pluginSettings })
          .from(hosts)
          .where(eq(hosts.id, host.id))
          .get();
        const settings = parseJson<Record<string, Record<string, unknown>>>(
          row?.pluginSettings,
          {},
        );
        const value = settings["ssh-terminal"]?.connectFrom;
        return typeof value === "string" ? value : host.connectFrom;
      },
      async set(hostId, origin) {
        const d = await db();
        const row = d.select().from(hosts).where(eq(hosts.id, hostId)).get();
        if (!row) throw notFound("host");
        const settings = parseJson<Record<string, Record<string, unknown>>>(
          row.pluginSettings,
          {},
        );
        settings["ssh-terminal"] = {
          ...(settings["ssh-terminal"] ?? {}),
          connectFrom: origin,
        };
        d.update(hosts)
          .set({ pluginSettings: JSON.stringify(settings), updatedAt: now() })
          .where(eq(hosts.id, hostId))
          .run();
        touched(hosts);
      },
    },

    connect: {
      async profile(id) {
        const d = await db();
        const row = d.select().from(hosts).where(eq(hosts.id, id)).get();
        if (!row) return null;
        const cred = row.credentialId
          ? d
              .select()
              .from(credentials)
              .where(eq(credentials.id, row.credentialId))
              .get()
          : undefined;
        return {
          host: hostFromRow(row),
          credential: cred ? credentialFromRow(cred) : null,
          sshOptions: parseJson<Record<string, unknown>>(row.sshOptions, {}),
          socks5: {
            use: row.useSocks5 ?? false,
            host: row.socks5Host ?? undefined,
            port: row.socks5Port ?? undefined,
            username: row.socks5Username ?? undefined,
            password: row.socks5Password ?? undefined,
            chain: parseJson<unknown[]>(row.socks5ProxyChain, []),
          },
          portKnock: parseJson(row.portKnockSequence, []),
          hostKey: row.hostKeyFingerprint
            ? {
                fingerprint: row.hostKeyFingerprint,
                keyType: row.hostKeyType ?? "unknown",
                changedCount: row.hostKeyChangedCount ?? 0,
              }
            : null,
        };
      },
      async saveHostKey(id, key, changed) {
        const d = await db();
        const row = d.select().from(hosts).where(eq(hosts.id, id)).get();
        if (!row) throw notFound("host");
        const at = now();
        d.update(hosts)
          .set({
            hostKeyFingerprint: key.fingerprint,
            hostKeyType: key.keyType,
            hostKeyAlgorithm: "sha256",
            hostKeyFirstSeen: changed ? row.hostKeyFirstSeen : at,
            hostKeyLastVerified: at,
            hostKeyChangedCount:
              (row.hostKeyChangedCount ?? 0) + (changed ? 1 : 0),
            updatedAt: at,
          })
          .where(eq(hosts.id, id))
          .run();
        touched(hosts);
      },
      async touchHostKey(id) {
        // No change event: a last seen time is not worth redrawing lists for.
        (await db())
          .update(hosts)
          .set({ hostKeyLastVerified: now() })
          .where(eq(hosts.id, id))
          .run();
      },
    },
  };
}
