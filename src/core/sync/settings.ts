import { accounts } from "@/core/accounts";
import { isServerAccount } from "@/core/accounts/types";
import { changes } from "@/core/db/changes";
import { localStores, type LocalStores } from "@/core/db/stores";
import { AppError } from "@/core/errors";
import { adapterFor } from "./entities";
import { SYNC_KINDS } from "./kinds";
import { sync } from "./manager";
import { SyncBook } from "./store";

async function book(accountId: string, stores: LocalStores) {
  const { db } = await stores.openForSync(accountId);
  return { db, book: new SyncBook(db) };
}

/**
 * Turns a kind of data on or off for one server. Off keeps it on this phone
 * only. Its types are forgotten, so turning it back on pulls them in full.
 */
export async function setKindEnabled(
  accountId: string,
  kindId: string,
  enabled: boolean,
  stores: LocalStores = localStores,
): Promise<void> {
  const account = accounts.find(accountId);
  const kind = SYNC_KINDS.find((k) => k.id === kindId);
  if (!isServerAccount(account) || !kind) {
    throw new AppError("No such setting", "NOT_FOUND");
  }
  const disabled = new Set(account.disabledTypes);
  for (const type of kind.types) {
    if (enabled) disabled.delete(type);
    else disabled.add(type);
  }
  await accounts.update(accountId, { disabledTypes: [...disabled] });
  const { book: records } = await book(accountId, stores);
  const state = records.state();
  records.setState({
    knownTypes: state.knownTypes.filter((t) => !kind.types.includes(t)),
  });
  sync.syncNow(accountId).catch(() => {});
}

/**
 * Keep mine puts the phone's version back so it goes up as a new edit. Use
 * server just forgets the phone's version.
 */
export async function resolveConflict(
  accountId: string,
  conflictId: number,
  keep: "mine" | "server",
  stores: LocalStores = localStores,
): Promise<void> {
  const { db, book: records } = await book(accountId, stores);
  const conflict = records.conflicts().find((c) => c.id === conflictId);
  if (!conflict) return;
  if (keep === "mine") {
    const adapter = adapterFor(conflict.entityType);
    db.transaction(() => {
      adapter.write(
        { db, extra: (t, id) => records.record(t, id)?.extra ?? null },
        { ...conflict.localRow, syncId: conflict.syncId },
      );
      records.removeConflict(conflictId);
    });
    adapter.tables.forEach((t) => changes.emit(accountId, t));
    sync.syncNow(accountId).catch(() => {});
  } else {
    records.removeConflict(conflictId);
  }
}

/** Sends refused changes again, for when the reason is gone. */
export async function retryRejected(
  accountId: string,
  stores: LocalStores = localStores,
): Promise<void> {
  const { book: records } = await book(accountId, stores);
  records.clearErrors();
  await sync.syncNow(accountId);
}

/** A short name for a synced row, for lists. */
export function rowLabel(row: Record<string, unknown>): string {
  const name = row.name ?? row.key ?? row.syncId;
  return typeof name === "string" && name ? name : "Untitled";
}

/** The plain name of an entity type. */
export function typeLabel(entityType: string): string {
  switch (entityType) {
    case "hosts":
      return "Host";
    case "sshCredentials":
      return "Login";
    case "sshFolders":
      return "Folder";
    case "snippets":
      return "Snippet";
    case "snippetFolders":
      return "Snippet folder";
    case "hostDefaults":
      return "Host default";
    case "userPreferences":
      return "Preferences";
    default:
      return entityType;
  }
}
