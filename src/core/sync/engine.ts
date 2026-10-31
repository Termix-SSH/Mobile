/**
 * One linked server's sync pass, ported from the desktop engine in
 * Plugins/Plugin-Sync/src/backend/engine.ts so both behave the same:
 *
 * - The first pass pulls everything, then pushes, so rows both sides already
 *   have match up instead of going back as edits.
 * - Later passes push, pull from the saved cursor, then backfill types the
 *   phone never pulled.
 * - The server wins a conflict. The phone's version is kept in the
 *   conflicts list so the user can put it back.
 */

import type { OpenedDb } from "@/core/db/driver";
import { createLogger } from "@/core/log/logger";
import {
  adapterFor,
  DEFAULT_ORDER,
  PUSHABLE_TYPES,
  type SyncContext,
} from "./entities";
import { hashRow } from "./hash";
import {
  PUSH_MAX_BYTES,
  PUSH_MAX_OPS,
  type ChangesPage,
  type EntityTypeInfo,
  type PushOp,
  type PushResult,
  type RemoteChange,
  type SyncRow,
} from "./protocol";
import { recordKey, SyncBook } from "./store";

const log = createLogger("sync");

const MAX_PAGES = 500;
const DELETED_HASH = "deleted";

/** The server calls a pass makes. SyncRemote, or a fake in tests. */
export interface EngineRemote {
  changes(
    cursor: number,
    options?: { limit?: number; types?: string[] },
  ): Promise<ChangesPage>;
  push(ops: PushOp[]): Promise<PushResult[]>;
}

export interface EngineDeps {
  open(): Promise<OpenedDb>;
  remote: EngineRemote;
  /** Entity types the user switched off. */
  disabledTypes(): string[];
  /** The server's accountProfile row. */
  onProfile?(row: SyncRow): void;
  /** Tables written, so lists refresh. */
  emit(tables: string[]): void;
  now?(): Date;
}

export interface PassSummary {
  pulled: number;
  pushed: number;
  conflicts: number;
  rejected: number;
  first: boolean;
}

interface PendingOp extends PushOp {
  hash: string | null;
}

export class SyncEngine {
  private serverTypes: EntityTypeInfo[] | null = null;

  constructor(private readonly deps: EngineDeps) {}

  /** Runs one full pass. Throws SyncError when the server can't be used. */
  async pass(): Promise<PassSummary> {
    const { db } = await this.deps.open();
    const book = new SyncBook(db);
    const ctx = this.context(db, book);
    const first = book.state().knownTypes.length === 0;
    const summary: PassSummary = {
      pulled: 0,
      pushed: 0,
      conflicts: 0,
      rejected: 0,
      first,
    };

    if (first) {
      await this.backfill(ctx, book, summary, true);
      await this.push(ctx, book, summary);
    } else {
      await this.push(ctx, book, summary);
      await this.pull(ctx, book, summary);
      // A kind switched back on: send what the phone kept meanwhile.
      if (await this.backfill(ctx, book, summary, false)) {
        await this.push(ctx, book, summary);
      }
    }
    book.setState({
      lastSyncAt: (this.deps.now?.() ?? new Date()).toISOString(),
    });
    return summary;
  }

  /** Sends local edits only, for a quick push after the user saves. */
  async pushOnly(): Promise<PassSummary> {
    const { db } = await this.deps.open();
    const book = new SyncBook(db);
    const summary: PassSummary = {
      pulled: 0,
      pushed: 0,
      conflicts: 0,
      rejected: 0,
      first: false,
    };
    if (book.state().knownTypes.length === 0) return summary;
    await this.push(this.context(db, book), book, summary);
    return summary;
  }

  private context(db: OpenedDb["db"], book: SyncBook): SyncContext {
    return {
      db,
      extra: (type, syncId) => book.record(type, syncId)?.extra ?? null,
    };
  }

  private disabled(): Set<string> {
    return new Set(this.deps.disabledTypes());
  }

  private orderOf(type: string): number {
    const info = this.serverTypes?.find((t) => t.type === type);
    return info?.order ?? DEFAULT_ORDER[type] ?? 1_000_000;
  }

  private learn(page: ChangesPage): void {
    if (Array.isArray(page.entityTypes) && page.entityTypes.length) {
      this.serverTypes = page.entityTypes;
    }
  }

  // Pull

  private async pull(
    ctx: SyncContext,
    book: SyncBook,
    summary: PassSummary,
  ): Promise<void> {
    let { cursor } = book.state();
    const disabled = this.disabled();
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await this.deps.remote.changes(cursor);
      this.learn(page);
      const known = new Set(book.state().knownTypes);
      const wanted = page.changes.filter(
        (c) => known.has(c.entityType) && !disabled.has(c.entityType),
      );
      summary.pulled += this.apply(ctx, book, wanted, false, summary);
      // Changes left out still move the cursor, like on the desktop.
      cursor = page.nextCursor;
      book.setState({ cursor });
      if (!page.hasMore) break;
    }
  }

  /** Pulls types the phone never pulled, from the start of the feed. */
  private async backfill(
    ctx: SyncContext,
    book: SyncBook,
    summary: PassSummary,
    first: boolean,
  ): Promise<boolean> {
    if (!this.serverTypes) {
      this.learn(
        await this.deps.remote.changes(book.state().cursor, { limit: 1 }),
      );
    }
    const known = new Set(book.state().knownTypes);
    const disabled = this.disabled();
    const fresh = (this.serverTypes ?? [])
      .map((t) => t.type)
      .filter((type) => !known.has(type) && !disabled.has(type));
    if (fresh.length === 0) return false;

    let cursor = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await this.deps.remote.changes(cursor, { types: fresh });
      this.learn(page);
      summary.pulled += this.apply(ctx, book, page.changes, true, summary);
      cursor = page.nextCursor;
      if (!page.hasMore) break;
    }
    const state = book.state();
    book.setState({
      knownTypes: [...new Set([...state.knownTypes, ...fresh])],
      ...(first ? { cursor: Math.max(state.cursor, cursor) } : {}),
    });
    return true;
  }

  /** Latest change per row, by type order, parents first, deletes last. */
  sortChanges(changes: RemoteChange[]): RemoteChange[] {
    const latest = new Map<string, RemoteChange>();
    for (const change of changes) {
      const key = recordKey(change.entityType, change.syncId);
      const seen = latest.get(key);
      if (!seen || change.seq >= seen.seq) latest.set(key, change);
    }
    const byType = new Map<string, RemoteChange[]>();
    for (const change of latest.values()) {
      const list = byType.get(change.entityType) ?? [];
      list.push(change);
      byType.set(change.entityType, list);
    }
    const out: RemoteChange[] = [];
    const types = [...byType.keys()].sort(
      (a, b) => this.orderOf(a) - this.orderOf(b) || a.localeCompare(b),
    );
    for (const type of types) {
      const list = byType.get(type)!;
      out.push(...parentsFirst(list.filter((c) => !c.deleted)));
      out.push(...list.filter((c) => c.deleted));
    }
    return out;
  }

  /** Writes server changes. Returns how many it applied. */
  private apply(
    ctx: SyncContext,
    book: SyncBook,
    changes: RemoteChange[],
    adopt: boolean,
    summary: PassSummary,
  ): number {
    if (changes.length === 0) return 0;
    const touched = new Set<string>();
    const retry: RemoteChange[] = [];
    let applied = 0;

    ctx.db.transaction(() => {
      for (const change of this.sortChanges(changes)) {
        const record = book.record(change.entityType, change.syncId);
        if (record && record.revision >= change.revision) continue;
        const adapter = adapterFor(change.entityType);
        try {
          if (
            !adapter.readOnly &&
            this.keepLocalEdit(ctx, book, change, adopt)
          ) {
            summary.conflicts++;
          }
          if (change.deleted || !change.row) {
            adapter.remove(ctx, change.syncId);
            book.put(change.entityType, change.syncId, {
              revision: change.revision,
              seq: change.seq,
              hash: null,
              deleted: true,
              extra: null,
              error: null,
              errorHash: null,
            });
          } else {
            const row = { ...change.row, syncId: change.syncId };
            const result = adapter.write(ctx, row);
            if (result.missing) retry.push(change);
            if (change.entityType === "accountProfile")
              this.deps.onProfile?.(row);
            book.put(change.entityType, change.syncId, {
              revision: change.revision,
              seq: change.seq,
              extra: result.extra,
              deleted: false,
              error: null,
              errorHash: null,
            });
            book.put(change.entityType, change.syncId, {
              hash: adapter.readOnly
                ? null
                : this.hashOf(ctx, change.entityType, change.syncId),
            });
          }
          adapter.tables.forEach((t) => touched.add(t));
          applied++;
        } catch (error) {
          log.warn("Skipped a synced row", {
            operation: "sync_apply",
            entityType: change.entityType,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Rows written before what they point at, once more now it is here.
      for (const change of retry) {
        try {
          const adapter = adapterFor(change.entityType);
          adapter.write(ctx, { ...change.row!, syncId: change.syncId });
          if (!adapter.readOnly) {
            book.put(change.entityType, change.syncId, {
              hash: this.hashOf(ctx, change.entityType, change.syncId),
            });
          }
        } catch {
          // The first write stands.
        }
      }
    });

    if (touched.size) this.deps.emit([...touched]);
    return applied;
  }

  private hashOf(
    ctx: SyncContext,
    type: string,
    syncId: string,
  ): string | null {
    const row = adapterFor(type).load(ctx, syncId);
    return row ? hashRow(row) : null;
  }

  /** Saves the phone's version when the server is about to overwrite an edit. */
  private keepLocalEdit(
    ctx: SyncContext,
    book: SyncBook,
    change: RemoteChange,
    adopt: boolean,
  ): boolean {
    const record = book.record(change.entityType, change.syncId);
    const local = adapterFor(change.entityType).load(ctx, change.syncId);
    if (!local) return false;
    const edited = record
      ? !record.deleted && record.hash !== hashRow(local)
      : !adopt;
    if (!edited) return false;
    book.addConflict(change.entityType, change.syncId, local, change.revision);
    return true;
  }

  // Push

  /** Local rows that differ from what the server last saw. */
  outbox(ctx: SyncContext, book: SyncBook): PendingOp[] {
    const known = new Set(book.state().knownTypes);
    const disabled = this.disabled();
    const onServer = this.serverTypes
      ? new Set(this.serverTypes.map((t) => t.type))
      : null;
    const ops: PendingOp[] = [];
    const types = PUSHABLE_TYPES.filter(
      (type) =>
        known.has(type) &&
        !disabled.has(type) &&
        (!onServer || onServer.has(type)),
    ).sort((a, b) => this.orderOf(a) - this.orderOf(b));

    for (const type of types) {
      const adapter = adapterFor(type);
      const rows = adapter.list(ctx);
      const records = book.records(type);
      for (const [syncId, row] of rows) {
        const record = records.get(recordKey(type, syncId));
        const hash = hashRow(row);
        if (record && !record.deleted && record.hash === hash) continue;
        if (record?.errorHash === hash && record.error !== "unavailable") {
          continue;
        }
        ops.push({
          entityType: type,
          syncId,
          op: "upsert",
          baseRevision: record?.revision ?? 0,
          row,
          hash,
        });
      }
      for (const record of records.values()) {
        if (record.deleted || record.revision <= 0) continue;
        if (rows.has(record.syncId)) continue;
        if (record.errorHash === DELETED_HASH) continue;
        ops.push({
          entityType: type,
          syncId: record.syncId,
          op: "delete",
          baseRevision: record.revision,
          hash: null,
        });
      }
    }
    return ops;
  }

  private async push(
    ctx: SyncContext,
    book: SyncBook,
    summary: PassSummary,
  ): Promise<void> {
    const ops = this.outbox(ctx, book);
    for (const batch of batches(ops)) {
      const results = await this.deps.remote.push(
        batch.map(({ hash: _hash, ...op }) => op),
      );
      this.settle(ctx, book, batch, results, summary);
    }
  }

  private settle(
    ctx: SyncContext,
    book: SyncBook,
    batch: PendingOp[],
    results: PushResult[],
    summary: PassSummary,
  ): void {
    const touched = new Set<string>();
    ctx.db.transaction(() => {
      batch.forEach((op, index) => {
        const result =
          results[index]?.syncId === op.syncId
            ? results[index]
            : results.find(
                (r) => r.syncId === op.syncId && r.entityType === op.entityType,
              );
        if (!result) return;
        if (result.status === "ok") {
          summary.pushed++;
          book.put(op.entityType, op.syncId, {
            revision: result.revision,
            hash: op.op === "delete" ? null : op.hash,
            deleted: op.op === "delete",
            error: null,
            errorHash: null,
          });
          return;
        }
        if (result.status === "rejected") {
          summary.rejected++;
          book.put(op.entityType, op.syncId, {
            revision: op.baseRevision,
            error: result.reason,
            errorHash: op.hash ?? DELETED_HASH,
          });
          return;
        }
        if (!result.row && !result.deleted) {
          // The server lost its record (revision 0), so start it over there.
          // The desktop resends forever here; see Termix-SSH/Plugin-Sync#3.
          if (result.revision === 0) {
            book.put(op.entityType, op.syncId, { revision: 0 });
          }
          return;
        }
        summary.conflicts++;
        if (op.op === "upsert" && op.row) {
          book.addConflict(op.entityType, op.syncId, op.row, result.revision);
        }
        const adapter = adapterFor(op.entityType);
        if (result.deleted || !result.row) {
          adapter.remove(ctx, op.syncId);
          book.put(op.entityType, op.syncId, {
            revision: result.revision,
            hash: null,
            deleted: true,
            extra: null,
          });
        } else {
          const written = adapter.write(ctx, {
            ...result.row,
            syncId: op.syncId,
          });
          book.put(op.entityType, op.syncId, {
            revision: result.revision,
            deleted: false,
            extra: written.extra,
            error: null,
            errorHash: null,
          });
          book.put(op.entityType, op.syncId, {
            hash: this.hashOf(ctx, op.entityType, op.syncId),
          });
        }
        adapter.tables.forEach((t) => touched.add(t));
      });
    });
    if (touched.size) this.deps.emit([...touched]);
  }
}

/** Groups of at most 200 ops and about 1 MB, under the server's limits. */
export function batches<T extends PushOp>(ops: T[]): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const op of ops) {
    const bytes = JSON.stringify(op.row ?? null).length + 200;
    if (
      current.length &&
      (current.length >= PUSH_MAX_OPS || size + bytes > PUSH_MAX_BYTES)
    ) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(op);
    size += bytes;
  }
  if (current.length) out.push(current);
  return out;
}

/** Hosts whose parent host comes in the same batch go after it. */
function parentsFirst(changes: RemoteChange[]): RemoteChange[] {
  const bySyncId = new Map(changes.map((c) => [c.syncId, c]));
  const out: RemoteChange[] = [];
  const done = new Set<RemoteChange>();
  const visiting = new Set<RemoteChange>();
  const visit = (change: RemoteChange) => {
    if (done.has(change) || visiting.has(change)) return;
    visiting.add(change);
    const parent = change.row?.parentHostSyncId;
    if (typeof parent === "string") {
      const target = bySyncId.get(parent);
      if (target) visit(target);
    }
    visiting.delete(change);
    done.add(change);
    out.push(change);
  };
  changes.forEach(visit);
  return out;
}
