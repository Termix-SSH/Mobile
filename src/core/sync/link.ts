import { accounts } from "@/core/accounts";
import { isServerAccount, type ServerAccount } from "@/core/accounts/types";
import { AppError } from "@/core/errors";
import { localStores, type LocalStores } from "@/core/db/stores";
import { changes } from "@/core/db/changes";
import {
  copyData,
  hasOwnData,
  ownDataCounts,
  type CopyResult,
  type OwnDataCounts,
} from "./copy";
import { deviceId, deviceName } from "./device";
import { SyncError } from "./errors";
import { SyncRemote } from "./remote";

export interface LinkOutcome {
  /** False when the server can't sync; the account then reads it live. */
  synced: boolean;
  /** True the first time this account linked, when Merge or Replace applies. */
  firstLink: boolean;
  /** Why it can't sync, when it can't. */
  reason?: string;
}

/** Servers that can't sync still work, read live like before. */
const LIVE_FALLBACK = new Set(["not_termix", "no_sync", "version_mismatch"]);

function requireAccount(accountId: string): ServerAccount {
  const account = accounts.find(accountId);
  if (!isServerAccount(account)) {
    throw new AppError("No such server account", "NOT_FOUND");
  }
  return account;
}

/**
 * Turns the fresh login the account just made into a long lived device
 * session (POST /sync/v2/link). The login session ends on the server. Run
 * after every sign in, and once for accounts signed in before sync.
 */
export async function linkAccount(accountId: string): Promise<LinkOutcome> {
  const account = requireAccount(accountId);
  const client = accounts.client(accountId);
  const loginToken = client?.token();
  if (!client || !loginToken) {
    throw new AppError("Sign in first.", "AUTH_REQUIRED");
  }
  const remote = new SyncRemote(client);

  let info;
  try {
    info = await remote.info();
  } catch (error) {
    if (error instanceof SyncError && LIVE_FALLBACK.has(error.kind)) {
      await accounts.update(accountId, {
        options: {
          ...account.options,
          sync: false,
          syncUnavailable: error.kind,
          syncCheckedAt: new Date().toISOString(),
        },
      });
      return { synced: false, firstLink: false, reason: error.kind };
    }
    throw error;
  }

  const result = await remote.link(loginToken, {
    deviceName: deviceName(),
    deviceId: await deviceId(),
  });
  if (account.remoteUserId && result.user?.id !== account.remoteUserId) {
    // Give back the session we were just handed, then say why.
    await remote.unlink(result.token).catch(() => {});
    await client.clearToken();
    await accounts.update(accountId, {
      status: "signed_out",
      lastError: "different_account",
    });
    throw new SyncError(
      "different_account",
      `This server account belongs to ${account.username ?? "another user"}. Sign in as them, or add the server again for this user.`,
    );
  }

  await client.setToken(result.token);
  const firstLink = !account.options.linkedOnce;
  await accounts.update(accountId, {
    remoteUserId: result.user.id,
    username: result.user.username,
    serverName: info.name ?? account.serverName,
    serverVersion:
      info.version ?? result.server?.version ?? account.serverVersion,
    status: "idle",
    lastError: null,
    options: {
      ...account.options,
      sync: true,
      linkedOnce: true,
      syncUnavailable: undefined,
      refreshCheckedAt: new Date().toISOString(),
    },
  });
  return { synced: true, firstLink };
}

/** Whether This device has anything for Merge to bring along. */
export async function thisDeviceHasData(
  stores: LocalStores = localStores,
): Promise<boolean> {
  try {
    return hasOwnData((await stores.get("local")).db);
  } catch {
    return false;
  }
}

/** What This device has that Merge would copy. Null when it can't be read. */
export async function thisDeviceCounts(
  stores: LocalStores = localStores,
): Promise<OwnDataCounts | null> {
  try {
    return ownDataCounts((await stores.get("local")).db);
  } catch {
    return null;
  }
}

/** Merge: copies This device's own data into the server account's copy. */
export async function mergeThisDevice(
  accountId: string,
  stores: LocalStores = localStores,
): Promise<CopyResult> {
  const from = await stores.get("local");
  const to = await stores.openForSync(accountId);
  const result = copyData(from.db, to.db);
  changes.emitAll(accountId);
  return result;
}

/**
 * Unlinks a server. Keep copies the user's own rows into This device first;
 * shared hosts and logins stay behind. Then the session ends on the server
 * and everything about the account is removed from the phone.
 */
export async function unlinkAccount(
  accountId: string,
  options: { keep: boolean; stop?: (accountId: string) => void },
  stores: LocalStores = localStores,
): Promise<CopyResult> {
  const account = requireAccount(accountId);
  const client = accounts.client(accountId);
  let result: CopyResult = { copied: 0, skipped: 0 };
  if (options.keep && account.options.sync) {
    const from = await stores.openForSync(accountId);
    const to = await stores.get("local");
    result = copyData(from.db, to.db);
    changes.emitAll("local");
  }
  options.stop?.(accountId);
  if (client?.token()) {
    await new SyncRemote(client).unlink().catch(() => {});
  }
  if (accounts.active().id === accountId) await accounts.setActive("local");
  await accounts.remove(accountId);
  return result;
}
