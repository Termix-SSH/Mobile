import { randomUUID } from "expo-crypto";
import type { LocalDb } from "@/core/db/driver";
import {
  credentials,
  folders,
  hosts,
  snippetFolders,
  snippets,
} from "@/core/db/schema";
import { adapterFor, type SyncContext } from "./entities";
import type { SyncRow } from "./protocol";

/** What gets copied, in an order where targets come first. */
const COPY_TYPES = [
  "sshCredentials",
  "sshFolders",
  "snippetFolders",
  "hosts",
  "snippets",
] as const;

type CopyType = (typeof COPY_TYPES)[number];

const norm = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

/** Rows that read as the same thing: never copied twice. */
const LOOKALIKE: Record<CopyType, (row: Record<string, unknown>) => string> = {
  sshCredentials: (r) => `${norm(r.name)}|${norm(r.username)}`,
  sshFolders: (r) => norm(r.name),
  snippetFolders: (r) => norm(r.name),
  hosts: (r) =>
    `${norm(r.name)}|${norm(r.ip)}|${norm(r.port)}|${norm(r.username)}`,
  snippets: (r) => `${norm(r.name)}|${norm(r.content)}`,
};

const TABLE = {
  sshCredentials: credentials,
  sshFolders: folders,
  snippetFolders: snippetFolders,
  hosts,
  snippets,
};

export interface CopyResult {
  copied: number;
  skipped: number;
}

const context = (db: LocalDb): SyncContext => ({ db, extra: () => null });

/**
 * Copies the user's own hosts, logins, folders and snippets from one
 * account's file to another, with new syncIds. Shared rows stay behind, and
 * a row that looks like one already there is skipped (its references point
 * at the one that is there).
 */
export function copyData(
  from: LocalDb,
  to: LocalDb,
  newId: () => string = randomUUID,
): CopyResult {
  const source = context(from);
  const target = context(to);
  const ids = new Map<string, string>();
  const result: CopyResult = { copied: 0, skipped: 0 };

  to.transaction(() => {
    const again: { type: CopyType; row: SyncRow }[] = [];
    for (const type of COPY_TYPES) {
      const adapter = adapterFor(type);
      const key = LOOKALIKE[type];
      const there = new Map<string, string>();
      for (const row of to.select().from(TABLE[type]).all() as Record<
        string,
        unknown
      >[]) {
        there.set(key(row), row.syncId as string);
      }

      let rows = [...adapter.list(source).values()];
      if (type === "hosts") rows = parentsFirst(rows);
      for (const row of rows) {
        const oldId = row.syncId as string;
        const match = there.get(key(row));
        if (match) {
          ids.set(oldId, match);
          result.skipped++;
          continue;
        }
        const syncId = newId();
        ids.set(oldId, syncId);
        const written = adapter.write(target, { ...remap(row, ids), syncId });
        // A jump host copied later: point at it once everything is here.
        if (written.missing)
          again.push({ type, row: { ...row, syncId: oldId } });
        there.set(key(row), syncId);
        result.copied++;
      }
    }
    for (const { type, row } of again) {
      const copy = remap(row, ids);
      adapterFor(type).write(target, {
        ...copy,
        syncId: ids.get(row.syncId as string),
      });
    }
  });
  return result;
}

/** Points every syncId a row names at its copy. */
function remap(row: SyncRow, ids: Map<string, string>): SyncRow {
  const swap = (value: unknown) =>
    typeof value === "string" ? (ids.get(value) ?? value) : value;
  const out: SyncRow = { ...row };
  for (const field of ["credentialSyncId", "parentHostSyncId"]) {
    if (field in out) out[field] = swap(out[field]);
  }
  if (typeof out.jumpHosts === "string") {
    try {
      const list = JSON.parse(out.jumpHosts);
      if (Array.isArray(list)) {
        out.jumpHosts = JSON.stringify(
          list.map((item) => ({ ...item, hostId: swap(item?.hostId) })),
        );
      }
    } catch {}
  }
  if (out.protocolAuth && typeof out.protocolAuth === "object") {
    const logins: Record<string, unknown> = {};
    for (const [protocol, login] of Object.entries(
      out.protocolAuth as Record<string, Record<string, unknown>>,
    )) {
      logins[protocol] =
        login && typeof login === "object" && "credentialSyncId" in login
          ? { ...login, credentialSyncId: swap(login.credentialSyncId) }
          : login;
    }
    out.protocolAuth = logins;
  }
  return out;
}

function parentsFirst(rows: SyncRow[]): SyncRow[] {
  const bySyncId = new Map(rows.map((r) => [r.syncId as string, r]));
  const out: SyncRow[] = [];
  const done = new Set<SyncRow>();
  const visit = (row: SyncRow) => {
    if (done.has(row)) return;
    done.add(row);
    const parent = bySyncId.get(row.parentHostSyncId as string);
    if (parent) visit(parent);
    out.push(row);
  };
  rows.forEach(visit);
  return out;
}

/** Whether an account's file has anything Merge would copy. */
export function hasOwnData(db: LocalDb): boolean {
  return COPY_TYPES.some((type) => adapterFor(type).list(context(db)).size > 0);
}

export interface OwnDataCounts {
  hosts: number;
  logins: number;
  snippets: number;
  folders: number;
}

/** How much Merge would copy, for the summary before the choice. */
export function ownDataCounts(db: LocalDb): OwnDataCounts {
  const size = (type: CopyType) => adapterFor(type).list(context(db)).size;
  return {
    hosts: size("hosts"),
    logins: size("sshCredentials"),
    snippets: size("snippets"),
    folders: size("sshFolders") + size("snippetFolders"),
  };
}

/** "12 hosts, 3 credentials and 5 snippets", leaving out what is zero. */
export function describeCounts(counts: OwnDataCounts): string {
  const parts = [
    [counts.hosts, "host"],
    [counts.logins, "credential"],
    [counts.snippets, "snippet"],
    [counts.folders, "folder"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, word]) => `${n} ${word}${n === 1 ? "" : "s"}`);
  if (parts.length === 0) return "nothing yet";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
