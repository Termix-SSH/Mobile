/**
 * Accounts mirror the desktop accounts in Plugin-Sync: "This device" works on
 * its own, and each linked server is its own account with its own data.
 */
export const LOCAL_ACCOUNT_ID = "local";

export type LinkStatus =
  "idle" | "syncing" | "offline" | "error" | "signed_out";

export interface LocalAccount {
  id: typeof LOCAL_ACCOUNT_ID;
  kind: "local";
}

/** Same fields as the desktop's sync link, minus secrets. */
export interface ServerAccount {
  id: string;
  kind: "server";
  serverUrl: string;
  serverName: string | null;
  serverVersion: string | null;
  username: string | null;
  remoteUserId: string | null;
  isAdmin: boolean;
  status: LinkStatus;
  lastError: string | null;
  linkedAt: string;
  lastSyncAt: string | null;
  /** Entity types the user turned off for sync. */
  disabledTypes: string[];
  options: Record<string, unknown>;
  /** Still being linked: hidden from lists and dropped if never finished. */
  pending?: boolean;
}

export type Account = LocalAccount | ServerAccount;

export function isServerAccount(
  account: Account | null | undefined,
): account is ServerAccount {
  return account?.kind === "server";
}

/** Name shown in the switcher: the server name, else its host. */
export function accountLabel(account: Account): string {
  if (account.kind === "local") return "This device";
  if (account.serverName) return account.serverName;
  try {
    return new URL(account.serverUrl).host || account.serverUrl;
  } catch {
    return account.serverUrl;
  }
}
