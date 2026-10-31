import recorded from "../fixtures/sync/recorded.json";
import type {
  EntityTypeInfo,
  PushOp,
  PushResult,
  RemoteChange,
  SyncRow,
} from "@/core/sync/protocol";
import { fakeServer, type SeenRequest } from "./http";

type Exchange = (typeof recorded.exchanges)[number];

/** A recorded answer by name. */
export function exchange(name: string): Exchange {
  const found = recorded.exchanges.find((e) => e.name === name);
  if (!found) throw new Error(`No recorded exchange ${name}`);
  return found;
}

/** Every change the phone pulled in the recording, in order. */
export function recordedChanges(): RemoteChange[] {
  return recorded.exchanges
    .filter((e) => /^changes-\d+$/.test(e.name))
    .flatMap((e) => (e.response.body as { changes: RemoteChange[] }).changes);
}

export const RECORDED_TYPES = (
  exchange("changes-0").response.body as { entityTypes: EntityTypeInfo[] }
).entityTypes;

interface Record_ {
  entityType: string;
  syncId: string;
  revision: number;
  seq: number;
  deleted: boolean;
  row: SyncRow | null;
}

/**
 * An in-memory /sync/v2 server with the real server's rules: a revision and
 * a feed position per record, conflicts when baseRevision is stale, read only
 * and unknown types refused. Starts with the rows of the recording.
 */
export class FakeSyncServer {
  records = new Map<string, Record_>();
  seq = 0;
  token = "device-token";
  loginToken = "login-token";
  refreshToken: string | null = null;
  userId = "<user-id>";
  username = "fixture";
  hostIds = new Map<string, number>();
  pushes: PushOp[][] = [];
  failNext: {
    status: number;
    data: unknown;
    headers?: Record<string, string>;
  } | null = null;
  entityTypes: EntityTypeInfo[] = RECORDED_TYPES;
  revoked = false;
  seen: SeenRequest[];

  constructor(options: { seed?: boolean } = {}) {
    if (options.seed !== false) {
      for (const change of recordedChanges()) {
        this.put(change.entityType, change.syncId, change.row, change.deleted);
      }
    }
    this.seen = fakeServer((req) => this.handle(req));
  }

  private key(type: string, syncId: string) {
    return `${type}\u0000${syncId}`;
  }

  /** A write from another device or the web app. */
  put(type: string, syncId: string, row: SyncRow | null, deleted = false) {
    const key = this.key(type, syncId);
    const current = this.records.get(key);
    this.records.set(key, {
      entityType: type,
      syncId,
      revision: (current?.revision ?? 0) + 1,
      seq: ++this.seq,
      deleted,
      row: deleted ? null : { ...row, syncId },
    });
  }

  /** Forgets a record, like a server that lost its bookkeeping. */
  lose(type: string, syncId: string) {
    this.records.delete(this.key(type, syncId));
  }

  get(type: string, syncId: string) {
    return this.records.get(this.key(type, syncId));
  }

  private authed(req: SeenRequest, token = this.token): boolean {
    if (this.revoked) return false;
    const auth = String(req.headers.Authorization ?? "");
    const cookie = String(req.headers.Cookie ?? "");
    return auth === `Bearer ${token}` || cookie.includes(`jwt=${token}`);
  }

  private handle(req: SeenRequest) {
    if (this.failNext) {
      const reply = this.failNext;
      this.failNext = null;
      return reply;
    }
    const path = req.url.replace(/^https?:\/\/[^/]+/, "");
    const unauthorized = { status: 401, data: { error: "Invalid token" } };

    if (path === "/sync/v2/info")
      return exchange("info").response.status === 200
        ? { data: exchange("info").response.body }
        : { status: 500 };
    if (path === "/sync/v2/link") {
      if (!this.authed(req, this.loginToken)) return unauthorized;
      return {
        data: {
          token: this.token,
          user: { id: this.userId, username: this.username },
          server: { version: "26.10.5" },
        },
      };
    }
    if (!this.authed(req)) return unauthorized;

    if (path === "/sync/v2/changes") {
      const params = (req.params ?? {}) as Record<string, string>;
      const cursor = Number(params.cursor ?? 0);
      const limit = Math.min(1000, Number(params.limit ?? 1000));
      const types = params.types ? params.types.split(",") : null;
      const after = [...this.records.values()]
        .filter((r) => r.seq > cursor)
        .sort((a, b) => a.seq - b.seq);
      const slice = after.slice(0, limit + 1);
      const page = slice.slice(0, limit);
      const changes = page
        .filter((r) => !types || types.includes(r.entityType))
        .map((r) => ({ ...r }));
      return {
        data: {
          changes,
          nextCursor: page.length ? page[page.length - 1].seq : cursor,
          hasMore: slice.length > limit,
          entityTypes: this.entityTypes,
        },
      };
    }
    if (path === "/sync/v2/push") {
      const ops = (req.data as { ops: PushOp[] }).ops;
      this.pushes.push(ops);
      return { data: { results: ops.map((op) => this.apply(op)) } };
    }
    if (path === "/sync/v2/session/refresh") {
      const token = this.refreshToken;
      if (token) {
        this.token = token;
        this.refreshToken = null;
      }
      return { data: { token } };
    }
    if (path === "/sync/v2/unlink") {
      this.revoked = true;
      return { data: { success: true } };
    }
    const host = path.match(/^\/sync\/v2\/hosts\/(.+)$/);
    if (host) {
      const id = this.hostIds.get(decodeURIComponent(host[1]));
      return id
        ? { data: { id, name: "host" } }
        : { status: 404, data: { error: "Not found" } };
    }
    return { status: 404, data: { error: "Not found" } };
  }

  private apply(op: PushOp): PushResult {
    const info = this.entityTypes.find((t) => t.type === op.entityType);
    const base = { syncId: op.syncId, entityType: op.entityType };
    if (!info) return { ...base, status: "rejected", reason: "unknown_type" };
    if (info.readOnly)
      return { ...base, status: "rejected", reason: "read_only" };
    const current = this.get(op.entityType, op.syncId);
    const revision = current?.revision ?? 0;
    if (op.baseRevision !== revision) {
      return {
        ...base,
        status: "conflict",
        revision,
        deleted: !!current?.deleted,
        row: current && !current.deleted ? current.row : null,
      };
    }
    this.put(op.entityType, op.syncId, op.row ?? null, op.op === "delete");
    return { ...base, status: "ok", revision: revision + 1 };
  }
}
