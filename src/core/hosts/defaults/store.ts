// Reads and writes the defaults levels in an account's local database, and
// rewrites the hosts that follow a default when it changes.
import { eq } from "drizzle-orm";
import type { LocalDb } from "@/core/db/driver";
import {
  adminDefaults,
  folders,
  hostDefaults,
  hosts,
  type HostRow,
} from "@/core/db/schema";
import { planHostDefaults, storedOverrides } from "./apply";
import {
  effectiveFolderPath,
  emptyIndex,
  type DefaultsIndex,
  type HostPlacement,
} from "./resolve";
import { joinKey, toObject, type DefaultsLevel } from "./values";

export type DefaultsTarget =
  { level: "user" } | { level: "folder"; folder: string };

function decode(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The wire id of one default, like core's sync/wire.ts. */
export function defaultSyncId(
  target: { level: DefaultsLevel; folderSyncId?: string | null },
  fullKey: string,
): string {
  return target.level === "folder"
    ? `f:${target.folderSyncId}:${fullKey}`
    : `u:${fullKey}`;
}

export function loadDefaultsIndex(d: LocalDb): DefaultsIndex {
  const index = emptyIndex();
  const admin = d.select().from(adminDefaults).get();
  for (const [key, value] of Object.entries(toObject(admin?.values) ?? {})) {
    index.admin.set(key, value);
  }
  const folderBySyncId = new Map<string, string>();
  for (const folder of d.select().from(folders).all()) {
    folderBySyncId.set(folder.syncId, folder.name);
    index.folders.set(folder.name, { name: folder.name, values: new Map() });
  }
  for (const row of d.select().from(hostDefaults).all()) {
    const fullKey = joinKey(row.namespace, row.key);
    const value = decode(row.value);
    if (row.level === "user") {
      index.user.set(fullKey, value);
    } else if (row.folderSyncId) {
      const name = folderBySyncId.get(row.folderSyncId);
      if (name) index.folders.get(name)?.values.set(fullKey, value);
    }
  }
  return index;
}

function folderSyncIdOf(d: LocalDb, name: string): string {
  const row = d.select().from(folders).where(eq(folders.name, name)).get();
  if (!row) throw new Error(`No folder named ${name}`);
  return row.syncId;
}

function rowFor(
  d: LocalDb,
  target: DefaultsTarget,
  fullKey: string,
): { syncId: string; folderSyncId: string | null } {
  const folderSyncId =
    target.level === "folder" ? folderSyncIdOf(d, target.folder) : null;
  return {
    syncId: defaultSyncId({ level: target.level, folderSyncId }, fullKey),
    folderSyncId,
  };
}

export function setDefault(
  d: LocalDb,
  target: DefaultsTarget,
  fullKey: string,
  value: unknown,
): void {
  const { syncId, folderSyncId } = rowFor(d, target, fullKey);
  const dot = fullKey.indexOf(".");
  const values = {
    level: target.level,
    folderSyncId,
    namespace: fullKey.slice(0, dot),
    key: fullKey.slice(dot + 1),
    value: JSON.stringify(value ?? null),
    updatedAt: new Date().toISOString(),
  };
  d.insert(hostDefaults)
    .values({ syncId, ...values })
    .onConflictDoUpdate({ target: hostDefaults.syncId, set: values })
    .run();
}

export function unsetDefault(
  d: LocalDb,
  target: DefaultsTarget,
  fullKey: string,
): void {
  const { syncId } = rowFor(d, target, fullKey);
  d.delete(hostDefaults).where(eq(hostDefaults.syncId, syncId)).run();
}

/** Where each host sits, for the folder a sub-host follows. */
export function placementOf(
  rows: Pick<HostRow, "id" | "folder" | "parentHostId">[],
): Map<number, HostPlacement> {
  return new Map(
    rows.map((row) => [
      row.id,
      { folder: row.folder || null, parentHostId: row.parentHostId ?? null },
    ]),
  );
}

function parseSettings(raw: string | null) {
  const parsed = toObject(raw) ?? {};
  return parsed as Record<string, Record<string, unknown>>;
}

/**
 * Rewrites every own host that follows a default whose value changed, and
 * classifies hosts the phone never classified. Returns how many changed.
 */
export function materializeHosts(d: LocalDb): number {
  const index = loadDefaultsIndex(d);
  let changed = 0;
  const rows = d.select().from(hosts).all();
  const placement = placementOf(rows);
  for (const row of rows) {
    if (row.sharedSource) continue;
    const plan = planHostDefaults({
      columns: row as unknown as Record<string, unknown>,
      index,
      folder: effectiveFolderPath(placement.get(row.id)!, placement),
      hostId: row.id,
      overrides: storedOverrides(row.defaultOverrides),
      pluginSettings: parseSettings(row.pluginSettings),
    });
    if (!plan.changed) continue;
    const patch: Partial<HostRow> = {};
    for (const [key, value] of Object.entries(plan.columns)) {
      if ((row as Record<string, unknown>)[key] !== value) {
        (patch as Record<string, unknown>)[key] = value;
      }
    }
    patch.defaultOverrides = JSON.stringify(plan.overrides);
    patch.updatedAt = new Date().toISOString();
    d.update(hosts).set(patch).where(eq(hosts.id, row.id)).run();
    changed++;
  }
  return changed;
}
