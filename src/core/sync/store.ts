import { and, eq } from "drizzle-orm";
import type { LocalDb } from "@/core/db/driver";
import { syncConflicts, syncRecords, syncState } from "@/core/db/schema";
import type { SyncRow } from "./protocol";

/** What the phone knows about one server record. */
export interface SyncRecord {
  entityType: string;
  syncId: string;
  revision: number;
  seq: number;
  hash: string | null;
  deleted: boolean;
  error: string | null;
  errorHash: string | null;
  extra: SyncRow | null;
}

export interface SyncStateRow {
  cursor: number;
  knownTypes: string[];
  lastSyncAt: string | null;
}

export interface SyncConflict {
  id: number;
  entityType: string;
  syncId: string;
  localRow: SyncRow;
  serverRevision: number;
  createdAt: string;
}

export const recordKey = (entityType: string, syncId: string) =>
  `${entityType}\u0000${syncId}`;

function parse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return (JSON.parse(text) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

type RecordRow = typeof syncRecords.$inferSelect;

function toRecord(row: RecordRow): SyncRecord {
  return {
    entityType: row.entityType,
    syncId: row.syncId,
    revision: row.revision,
    seq: row.seq,
    hash: row.hash,
    deleted: row.deleted,
    error: row.error,
    errorHash: row.errorHash,
    extra: parse<SyncRow | null>(row.extra, null),
  };
}

/** The sync_records, sync_state and sync_conflicts of one account's file. */
export class SyncBook {
  constructor(private readonly db: LocalDb) {}

  records(entityType?: string): Map<string, SyncRecord> {
    const rows = entityType
      ? this.db
          .select()
          .from(syncRecords)
          .where(eq(syncRecords.entityType, entityType))
          .all()
      : this.db.select().from(syncRecords).all();
    return new Map(
      rows.map((row) => [recordKey(row.entityType, row.syncId), toRecord(row)]),
    );
  }

  record(entityType: string, syncId: string): SyncRecord | null {
    const row = this.db
      .select()
      .from(syncRecords)
      .where(
        and(
          eq(syncRecords.entityType, entityType),
          eq(syncRecords.syncId, syncId),
        ),
      )
      .get();
    return row ? toRecord(row) : null;
  }

  put(
    entityType: string,
    syncId: string,
    next: Partial<Omit<SyncRecord, "entityType" | "syncId">>,
  ): void {
    const current = this.record(entityType, syncId);
    const merged = {
      revision: next.revision ?? current?.revision ?? 0,
      seq: next.seq ?? current?.seq ?? 0,
      hash: next.hash !== undefined ? next.hash : (current?.hash ?? null),
      deleted: next.deleted ?? current?.deleted ?? false,
      error: next.error !== undefined ? next.error : (current?.error ?? null),
      errorHash:
        next.errorHash !== undefined
          ? next.errorHash
          : (current?.errorHash ?? null),
      extra: JSON.stringify(
        next.extra !== undefined ? next.extra : (current?.extra ?? null),
      ),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .insert(syncRecords)
      .values({ entityType, syncId, ...merged })
      .onConflictDoUpdate({
        target: [syncRecords.entityType, syncRecords.syncId],
        set: merged,
      })
      .run();
  }

  remove(entityType: string, syncId: string): void {
    this.db
      .delete(syncRecords)
      .where(
        and(
          eq(syncRecords.entityType, entityType),
          eq(syncRecords.syncId, syncId),
        ),
      )
      .run();
  }

  /** Records whose last push was refused, so their content is not resent. */
  errors(): SyncRecord[] {
    return [...this.records().values()].filter((r) => r.error);
  }

  clearErrors(): void {
    this.db.update(syncRecords).set({ error: null, errorHash: null }).run();
  }

  state(): SyncStateRow {
    const row = this.db
      .select()
      .from(syncState)
      .where(eq(syncState.id, 1))
      .get();
    return {
      cursor: row?.cursor ?? 0,
      knownTypes: parse<string[]>(row?.knownTypes, []),
      lastSyncAt: row?.lastSyncAt ?? null,
    };
  }

  setState(next: Partial<SyncStateRow>): void {
    const merged = { ...this.state(), ...next };
    const values = {
      cursor: merged.cursor,
      knownTypes: JSON.stringify(merged.knownTypes),
      lastSyncAt: merged.lastSyncAt,
    };
    this.db
      .insert(syncState)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: syncState.id, set: values })
      .run();
  }

  addConflict(
    entityType: string,
    syncId: string,
    localRow: SyncRow,
    serverRevision: number,
  ): void {
    // One per row: a newer loss replaces the older one.
    this.db
      .delete(syncConflicts)
      .where(
        and(
          eq(syncConflicts.entityType, entityType),
          eq(syncConflicts.syncId, syncId),
        ),
      )
      .run();
    this.db
      .insert(syncConflicts)
      .values({
        entityType,
        syncId,
        localRow: JSON.stringify(localRow),
        serverRevision,
      })
      .run();
  }

  conflicts(): SyncConflict[] {
    return this.db
      .select()
      .from(syncConflicts)
      .all()
      .map((row) => ({
        id: row.id,
        entityType: row.entityType,
        syncId: row.syncId,
        localRow: parse<SyncRow>(row.localRow, {}),
        serverRevision: row.serverRevision,
        createdAt: row.createdAt,
      }));
  }

  removeConflict(id: number): void {
    this.db.delete(syncConflicts).where(eq(syncConflicts.id, id)).run();
  }

  /** Forgets every record and the cursor, for a fresh start. */
  reset(): void {
    this.db.delete(syncRecords).run();
    this.db.delete(syncConflicts).run();
    this.db.delete(syncState).run();
  }
}
