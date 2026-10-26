import { useEffect, useSyncExternalStore } from "react";
import type { AccountClient } from "@/core/api/AccountClient";
import type { ApiModules } from "@/core/api/modules";
import { AppError } from "@/core/errors";
import { AccountStore } from "./store";
import type { Account } from "./types";

export * from "./types";
export { AccountStore, sameServerUrl } from "./store";
export { hasUsableData } from "./usable";

/** The app's account list. Clients come from here, never from a global. */
export const accounts = new AccountStore();

export function activeClient(): AccountClient | null {
  return accounts.activeClient();
}

export function clientFor(accountId: string): AccountClient | null {
  return accounts.client(accountId);
}

/** The active account's client, or an error when This device is active. */
export function requireActiveClient(): AccountClient {
  const client = accounts.activeClient();
  if (!client) {
    throw new AppError("Link a Termix server to use this", "NO_SERVER");
  }
  return client;
}

/** API of a client from a hook, or an error when there is no server. */
export function apiOf(client: AccountClient | null): ApiModules {
  if (!client) {
    throw new AppError("Link a Termix server to use this", "NO_SERVER");
  }
  return client.api;
}

/** API of the active account. Session code uses its own account instead. */
export function api(): ApiModules {
  return requireActiveClient().api;
}

export function useAccounts(): { accounts: Account[]; active: Account } {
  return useSyncExternalStore(
    accounts.subscribe,
    accounts.getSnapshot,
    accounts.getSnapshot,
  );
}

export function useActiveAccount(): Account {
  return useAccounts().active;
}

/** Re-renders when the account or its server features change. */
export function useClient(accountId: string | null): AccountClient | null {
  useAccounts();
  const client = accountId ? accounts.client(accountId) : null;
  const version = () => client?.version ?? -1;
  useSyncExternalStore(
    (listener) => client?.subscribe(listener) ?? (() => {}),
    version,
    version,
  );
  // Only the active account loads on start; others load when a screen asks.
  useEffect(() => {
    void client?.load();
  }, [client]);
  return client;
}

export function useActiveClient(): AccountClient | null {
  return useClient(useActiveAccount().id);
}
