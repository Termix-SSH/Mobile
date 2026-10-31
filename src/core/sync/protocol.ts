/**
 * Plugin-Sync's /sync/v2 protocol, as the server speaks it. See
 * Plugins/Plugin-Sync/docs/protocol.md and src/backend/server-routes.ts.
 */

/** The protocol numbers this app understands. */
export const SUPPORTED_PROTOCOL = 1;

export type SyncRow = Record<string, unknown>;

export interface ServerInfo {
  termix: true;
  name?: string;
  version?: string;
  protocol: number;
  clientTypes?: string[];
}

export interface LinkResult {
  token: string;
  user: { id: string; username: string };
  server?: { version?: string };
}

export interface RemoteChange {
  seq: number;
  entityType: string;
  syncId: string;
  revision: number;
  deleted: boolean;
  row: SyncRow | null;
}

export interface EntityTypeInfo {
  type: string;
  owner?: string;
  order: number;
  readOnly?: boolean;
}

export interface ChangesPage {
  changes: RemoteChange[];
  nextCursor: number;
  hasMore: boolean;
  entityTypes: EntityTypeInfo[];
}

export interface PushOp {
  entityType: string;
  syncId: string;
  baseRevision: number;
  op: "upsert" | "delete";
  row?: SyncRow;
}

export type PushResult =
  | { syncId: string; entityType: string; status: "ok"; revision: number }
  | {
      syncId: string;
      entityType: string;
      status: "conflict";
      revision: number;
      deleted: boolean;
      row: SyncRow | null;
    }
  | { syncId: string; entityType: string; status: "rejected"; reason: string };

/** Server limits: 1000 changes per page, 500 ops and a 2 MB body per push. */
export const PAGE_LIMIT = 1000;
export const PUSH_MAX_OPS = 200;
export const PUSH_MAX_BYTES = 1_000_000;
export const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;

export function singletonSyncId(entityType: string): string {
  return `${entityType}:singleton`;
}

/** A device id the server accepts: 8 to 100 letters, digits, ".", "-", "_". */
export function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{8,100}$/.test(value);
}
