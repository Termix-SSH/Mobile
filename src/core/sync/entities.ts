/**
 * How each server entity type lands in this phone's database. Rows match the
 * server's columns one to one (see Termix/src/backend/sync/entities.ts and
 * wire.ts): local ids become syncIds on the wire, and server fields the phone
 * has no column for are kept on the record and sent back unchanged.
 */

import {
  and,
  eq,
  getTableColumns,
  getTableName,
  isNotNull,
  isNull,
} from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { LocalDb } from "@/core/db/driver";
import {
  adminDefaults,
  credentials,
  folders,
  hostDefaults,
  hosts,
  snippetFolders,
  snippets,
  syncEntities,
  userPreferences,
} from "@/core/db/schema";
import { singletonSyncId, type SyncRow } from "./protocol";

export interface SyncContext {
  db: LocalDb;
  /** Server fields the phone kept for a row, from its record. */
  extra(entityType: string, syncId: string): SyncRow | null;
}

export interface WriteResult {
  /** A syncId it points at isn't here yet; write it again at the end. */
  missing: boolean;
  /** Server fields to keep on the record. */
  extra: SyncRow | null;
}

export interface EntityAdapter {
  type: string;
  /** Never pushed: the server owns it, or the phone never edits it. */
  readOnly: boolean;
  /** Local tables it writes, for change notices. */
  tables: string[];
  /** Every row this phone could push, by syncId. */
  list(ctx: SyncContext): Map<string, SyncRow>;
  load(ctx: SyncContext, syncId: string): SyncRow | null;
  write(ctx: SyncContext, row: SyncRow): WriteResult;
  remove(ctx: SyncContext, syncId: string): void;
}

/** Order when the server hasn't said yet: targets before what points at them. */
export const DEFAULT_ORDER: Record<string, number> = {
  accountProfile: 5,
  hostDefaultsAdmin: 7,
  sshCredentials: 10,
  sharedCredentials: 15,
  vaultProfiles: 20,
  sshFolders: 30,
  snippetFolders: 40,
  hosts: 50,
  sharedHosts: 55,
  hostDefaults: 60,
  snippets: 60,
  userPreferences: 90,
  pluginUserSettings: 95,
};

type Table = SQLiteTable & { id: any; syncId: any; sharedSource?: any };

const TABLES = {
  sshCredentials: credentials as unknown as Table,
  sshFolders: folders as unknown as Table,
  hosts: hosts as unknown as Table,
  snippetFolders: snippetFolders as unknown as Table,
  snippets: snippets as unknown as Table,
};
type RefTarget = keyof typeof TABLES;

function idFor(db: LocalDb, target: RefTarget, syncId: string): number | null {
  const table = TABLES[target];
  const row = db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.syncId, syncId))
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

function syncIdFor(db: LocalDb, target: RefTarget, id: number): string | null {
  const table = TABLES[target];
  const row = db
    .select({ syncId: table.syncId })
    .from(table)
    .where(eq(table.id, id))
    .get() as { syncId: string } | undefined;
  return row?.syncId ?? null;
}

const toBool = (value: unknown) =>
  value === true || value === 1 || value === "1" || value === "true";

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || !value) return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

interface Ref {
  field: string;
  wire: string;
  target: RefTarget;
}

interface JsonRef {
  column: string;
  key: string;
  target: RefTarget;
}

interface TableSpec {
  type: string;
  table: Table;
  fields: string[];
  bools?: string[];
  /** JSON columns the server sends as objects. */
  objects?: string[];
  /** Text columns that hold true/false as text. */
  boolText?: string[];
  refs?: Ref[];
  jsonRefs?: JsonRef[];
  /** Rows of this type are shared copies (read only), not the user's own. */
  shared?: { idField?: string };
  /** Rows the user can push. Shared copies and local only rows are not. */
  owned?: (row: Record<string, unknown>) => boolean;
}

/** Keys that never reach a column or the kept extras. */
const SKIP_EXTRA = new Set([
  "id",
  "syncId",
  "userId",
  "createdAt",
  "updatedAt",
]);

function tableAdapter(spec: TableSpec): EntityAdapter {
  const { table } = spec;
  const known = new Set([
    ...spec.fields,
    ...(spec.refs ?? []).flatMap((r) => [r.field, r.wire]),
    ...SKIP_EXTRA,
    "shared",
  ]);
  const ownedOnly = spec.shared
    ? isNotNull(table.sharedSource)
    : table.sharedSource
      ? isNull(table.sharedSource)
      : undefined;
  const bySyncId = (syncId: string) =>
    ownedOnly
      ? and(eq(table.syncId, syncId), ownedOnly)
      : eq(table.syncId, syncId);

  const toWire = (ctx: SyncContext, row: Record<string, unknown>): SyncRow => {
    const wire: SyncRow = {
      ...(ctx.extra(spec.type, row.syncId as string) ?? {}),
    };
    for (const field of spec.fields) {
      let value = row[field];
      if (spec.objects?.includes(field)) value = parseJson(value) ?? {};
      wire[field] = value ?? null;
    }
    for (const ref of spec.refs ?? []) {
      const id = row[ref.field];
      wire[ref.wire] =
        typeof id === "number" ? syncIdFor(ctx.db, ref.target, id) : null;
    }
    for (const ref of spec.jsonRefs ?? []) {
      const list = parseJson(row[ref.column]);
      if (!Array.isArray(list)) continue;
      wire[ref.column] = JSON.stringify(
        list.map((item) => {
          const id = Number(item?.[ref.key]);
          return Number.isInteger(id)
            ? { ...item, [ref.key]: syncIdFor(ctx.db, ref.target, id) }
            : item;
        }),
      );
    }
    wire.syncId = row.syncId;
    return wire;
  };

  return {
    type: spec.type,
    readOnly: !!spec.shared,
    tables: [getTableName(table)],
    list(ctx) {
      const out = new Map<string, SyncRow>();
      if (spec.shared) return out;
      const rows = (
        ownedOnly
          ? ctx.db.select().from(table).where(ownedOnly).all()
          : ctx.db.select().from(table).all()
      ) as Record<string, unknown>[];
      for (const row of rows) {
        if (spec.owned && !spec.owned(row)) continue;
        out.set(row.syncId as string, toWire(ctx, row));
      }
      return out;
    },
    load(ctx, syncId) {
      const row = ctx.db.select().from(table).where(bySyncId(syncId)).get() as
        Record<string, unknown> | undefined;
      if (!row || (spec.owned && !spec.owned(row))) return null;
      return toWire(ctx, row);
    },
    write(ctx, wire) {
      const syncId = wire.syncId as string;
      const current = ctx.db
        .select()
        .from(table)
        .where(eq(table.syncId, syncId))
        .get() as Record<string, unknown> | undefined;
      let missing = false;
      const values: Record<string, unknown> = {};
      for (const field of spec.fields) {
        if (!(field in wire)) continue;
        let value = wire[field];
        if (spec.bools?.includes(field))
          value = value == null ? null : toBool(value);
        else if (spec.boolText?.includes(field) && typeof value === "boolean") {
          value = String(value);
        } else if (spec.objects?.includes(field)) {
          value = value == null ? null : JSON.stringify(value);
        } else if (value !== null && typeof value === "object") {
          value = JSON.stringify(value);
        }
        values[field] = value;
      }
      for (const ref of spec.refs ?? []) {
        const target = wire[ref.wire];
        if (typeof target !== "string" || !target) {
          values[ref.field] = null;
          continue;
        }
        const id = idFor(ctx.db, ref.target, target);
        if (id === null) {
          missing = true;
          values[ref.field] = current?.[ref.field] ?? null;
        } else {
          values[ref.field] = id;
        }
      }
      for (const ref of spec.jsonRefs ?? []) {
        const list = parseJson(values[ref.column]);
        if (!Array.isArray(list)) continue;
        values[ref.column] = JSON.stringify(
          list.map((item) => {
            const target = item?.[ref.key];
            if (typeof target !== "string" || !target) return item;
            const id = idFor(ctx.db, ref.target, target);
            if (id === null) missing = true;
            return { ...item, [ref.key]: id };
          }),
        );
      }
      if (spec.shared) {
        values.sharedSource = JSON.stringify(wire.shared ?? {});
        const idField = spec.shared.idField;
        const serverId = idField
          ? (wire.shared as Record<string, unknown> | undefined)?.[idField]
          : undefined;
        if (typeof serverId === "number" && "serverId" in table) {
          values.serverId = serverId;
        }
      }

      const extra: SyncRow = {};
      for (const [key, value] of Object.entries(wire)) {
        if (!known.has(key)) extra[key] = value;
      }

      if (current) {
        ctx.db
          .update(table)
          .set({ ...values, updatedAt: new Date().toISOString() } as never)
          .where(eq(table.syncId, syncId))
          .run();
      } else {
        ctx.db
          .insert(table)
          .values({ ...values, syncId } as never)
          .run();
      }
      return { missing, extra: Object.keys(extra).length ? extra : null };
    },
    remove(ctx, syncId) {
      ctx.db.delete(table).where(bySyncId(syncId)).run();
    },
  };
}

const CREDENTIAL_FIELDS = [
  "name",
  "description",
  "folder",
  "tags",
  "pin",
  "sortOrder",
  "authType",
  "username",
  "password",
  "key",
  "privateKey",
  "publicKey",
  "keyPassword",
  "keyType",
  "detectedKeyType",
  "certPublicKey",
];

const HOST_FIELDS = [
  "connectionType",
  "name",
  "ip",
  "port",
  "username",
  "folder",
  "tags",
  "pin",
  "sortOrder",
  "authType",
  "shareSshAuth",
  "forceKeyboardInteractive",
  "password",
  "key",
  "keyPassword",
  "keyType",
  "sudoPassword",
  "overrideCredentialUsername",
  "jumpHosts",
  "statusCheckEnabled",
  "statusCheckInterval",
  "sshOptions",
  "notes",
  "color",
  "icon",
  "enableSsh",
  "sshPort",
  "useSocks5",
  "socks5Host",
  "socks5Port",
  "socks5Username",
  "socks5Password",
  "socks5ProxyChain",
  "portKnockSequence",
  "hostKeyFingerprint",
  "hostKeyType",
  "hostKeyAlgorithm",
  "hostKeyFirstSeen",
  "hostKeyChangedCount",
  "defaultOverrides",
  "pluginSettings",
  "protocolAuth",
];

const HOST_BOOLS = [
  "pin",
  "shareSshAuth",
  "overrideCredentialUsername",
  "statusCheckEnabled",
  "enableSsh",
  "useSocks5",
];

const hostSpec = (type: string, shared: boolean): TableSpec => ({
  type,
  table: TABLES.hosts,
  fields: HOST_FIELDS,
  bools: HOST_BOOLS,
  boolText: ["forceKeyboardInteractive"],
  objects: ["pluginSettings", "protocolAuth"],
  refs: [
    {
      field: "credentialId",
      wire: "credentialSyncId",
      target: "sshCredentials",
    },
    { field: "parentHostId", wire: "parentHostSyncId", target: "hosts" },
  ],
  jsonRefs: [{ column: "jumpHosts", key: "hostId", target: "hosts" }],
  owned: shared ? undefined : (row) => !row.localOnly,
  shared: shared ? { idField: "hostId" } : undefined,
});

const credentialSpec = (type: string, shared: boolean): TableSpec => ({
  type,
  table: TABLES.sshCredentials,
  fields: CREDENTIAL_FIELDS,
  bools: ["pin"],
  shared: shared ? {} : undefined,
});

const PREFERENCE_COLUMNS = Object.entries(
  getTableColumns(userPreferences),
).filter(([key]) => key !== "id" && key !== "updatedAt");
const PREFERENCE_FIELDS = PREFERENCE_COLUMNS.map(([key]) => key);
const PREFERENCE_BOOLS = new Set(
  PREFERENCE_COLUMNS.filter(
    ([, col]) => col.columnType === "SQLiteBoolean",
  ).map(([key]) => key),
);

/** One row of user settings, id 1, syncId "userPreferences:singleton". */
const preferencesAdapter: EntityAdapter = {
  type: "userPreferences",
  readOnly: false,
  tables: [getTableName(userPreferences)],
  list(ctx) {
    const row = this.load(ctx, singletonSyncId("userPreferences"));
    return row ? new Map([[row.syncId as string, row]]) : new Map();
  },
  load(ctx, syncId) {
    const row = ctx.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.id, 1))
      .get() as Record<string, unknown> | undefined;
    if (!row) return null;
    const wire: SyncRow = { ...(ctx.extra(this.type, syncId) ?? {}) };
    for (const field of PREFERENCE_FIELDS) wire[field] = row[field] ?? null;
    wire.syncId = syncId;
    return wire;
  },
  write(ctx, wire) {
    const values: Record<string, unknown> = {};
    const extra: SyncRow = {};
    for (const [key, value] of Object.entries(wire)) {
      if (PREFERENCE_BOOLS.has(key)) {
        values[key] = value == null ? null : toBool(value);
      } else if (PREFERENCE_FIELDS.includes(key)) {
        values[key] = value;
      } else if (!SKIP_EXTRA.has(key)) {
        extra[key] = value;
      }
    }
    ctx.db
      .insert(userPreferences)
      .values({ id: 1, ...values } as never)
      .onConflictDoUpdate({ target: userPreferences.id, set: values as never })
      .run();
    return { missing: false, extra: Object.keys(extra).length ? extra : null };
  },
  remove(ctx) {
    ctx.db.delete(userPreferences).where(eq(userPreferences.id, 1)).run();
  },
};

/** Host defaults, one row per key, keyed by their syncId. */
const hostDefaultsAdapter: EntityAdapter = {
  type: "hostDefaults",
  readOnly: false,
  tables: [getTableName(hostDefaults)],
  list(ctx) {
    const out = new Map<string, SyncRow>();
    for (const row of ctx.db.select().from(hostDefaults).all()) {
      out.set(row.syncId, this.load(ctx, row.syncId)!);
    }
    return out;
  },
  load(ctx, syncId) {
    const row = ctx.db
      .select()
      .from(hostDefaults)
      .where(eq(hostDefaults.syncId, syncId))
      .get();
    if (!row) return null;
    return {
      ...(ctx.extra(this.type, syncId) ?? {}),
      syncId,
      level: row.level,
      folderSyncId: row.folderSyncId,
      namespace: row.namespace,
      key: row.key,
      value: parseJson(row.value),
    };
  },
  write(ctx, wire) {
    const values = {
      level: wire.level === "folder" ? ("folder" as const) : ("user" as const),
      folderSyncId:
        typeof wire.folderSyncId === "string" ? wire.folderSyncId : null,
      namespace: String(wire.namespace ?? ""),
      key: String(wire.key ?? ""),
      value: wire.value === undefined ? null : JSON.stringify(wire.value),
      updatedAt: new Date().toISOString(),
    };
    ctx.db
      .insert(hostDefaults)
      .values({ syncId: wire.syncId as string, ...values })
      .onConflictDoUpdate({ target: hostDefaults.syncId, set: values })
      .run();
    return { missing: false, extra: null };
  },
  remove(ctx, syncId) {
    ctx.db.delete(hostDefaults).where(eq(hostDefaults.syncId, syncId)).run();
  },
};

/** The admin's defaults, kept as sent. */
const adminDefaultsAdapter: EntityAdapter = {
  type: "hostDefaultsAdmin",
  readOnly: true,
  tables: [getTableName(adminDefaults)],
  list: () => new Map(),
  load: () => null,
  write(ctx, wire) {
    const values = {
      values: JSON.stringify(
        wire.values && typeof wire.values === "object" ? wire.values : {},
      ),
      updatedAt: new Date().toISOString(),
    };
    ctx.db
      .insert(adminDefaults)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: adminDefaults.id, set: values })
      .run();
    return { missing: false, extra: null };
  },
  remove(ctx) {
    ctx.db.delete(adminDefaults).where(eq(adminDefaults.id, 1)).run();
  },
};

/** Any other type, kept as wire JSON. The phone never edits these. */
export function genericAdapter(type: string): EntityAdapter {
  const where = (syncId: string) =>
    and(eq(syncEntities.entityType, type), eq(syncEntities.syncId, syncId));
  return {
    type,
    readOnly: true,
    tables: [getTableName(syncEntities)],
    list: () => new Map(),
    load(ctx, syncId) {
      const row = ctx.db.select().from(syncEntities).where(where(syncId)).get();
      return row ? (parseJson(row.data) as SyncRow) : null;
    },
    write(ctx, wire) {
      const data = JSON.stringify(wire);
      ctx.db
        .insert(syncEntities)
        .values({ entityType: type, syncId: wire.syncId as string, data })
        .onConflictDoUpdate({
          target: [syncEntities.entityType, syncEntities.syncId],
          set: { data, updatedAt: new Date().toISOString() },
        })
        .run();
      return { missing: false, extra: null };
    },
    remove(ctx, syncId) {
      ctx.db.delete(syncEntities).where(where(syncId)).run();
    },
  };
}

const ADAPTERS: Record<string, EntityAdapter> = {
  sshCredentials: tableAdapter(credentialSpec("sshCredentials", false)),
  sharedCredentials: tableAdapter(credentialSpec("sharedCredentials", true)),
  sshFolders: tableAdapter({
    type: "sshFolders",
    table: TABLES.sshFolders,
    fields: ["name", "color", "icon", "sortOrder"],
    refs: [
      {
        field: "credentialId",
        wire: "credentialSyncId",
        target: "sshCredentials",
      },
    ],
    owned: (row) => !row.localOnly,
  }),
  snippetFolders: tableAdapter({
    type: "snippetFolders",
    table: TABLES.snippetFolders,
    fields: ["name", "color", "icon"],
  }),
  hosts: tableAdapter(hostSpec("hosts", false)),
  sharedHosts: tableAdapter(hostSpec("sharedHosts", true)),
  snippets: tableAdapter({
    type: "snippets",
    table: TABLES.snippets,
    fields: [
      "name",
      "content",
      "description",
      "folder",
      "order",
      "hostFilter",
      "isNote",
    ],
    bools: ["isNote"],
  }),
  hostDefaults: hostDefaultsAdapter,
  hostDefaultsAdmin: adminDefaultsAdapter,
  userPreferences: preferencesAdapter,
};

const generic = new Map<string, EntityAdapter>();

export function adapterFor(type: string): EntityAdapter {
  const known = ADAPTERS[type];
  if (known) return known;
  let adapter = generic.get(type);
  if (!adapter) {
    adapter = genericAdapter(type);
    generic.set(type, adapter);
  }
  return adapter;
}

/** Types the phone can edit and push. */
export const PUSHABLE_TYPES = Object.values(ADAPTERS)
  .filter((a) => !a.readOnly)
  .map((a) => a.type);

/** The user's own tables, that a local edit can change. */
export const EDITABLE_TABLES = [
  ...new Set(
    Object.values(ADAPTERS)
      .filter((a) => !a.readOnly)
      .flatMap((a) => a.tables),
  ),
];
