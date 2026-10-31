import type { Account } from "@/core/accounts/types";
import type { AccountClient } from "@/core/api/AccountClient";
import { localStores } from "@/core/db/stores";
import { accountStorage } from "@/core/storage/kv";
import { AppError } from "@/core/errors";
import { localRepositories } from "./local";
import { serverRepositories } from "./server";
import { withServerHistory } from "./history-sync";
import { withSharedSnippets } from "./shared-snippets";
import type { DataRepositories, Repository } from "./types";

export * from "./types";
export { serverRepositories } from "./server";
export { localRepositories } from "./local";

const noop = () => () => {};

const refuse = (what: string) => async (): Promise<never> => {
  throw new AppError(`This device can't save ${what} here.`, "NO_LOCAL_STORE");
};

function emptyRepository<T, Draft>(what: string): Repository<T, Draft> {
  return {
    subscribe: noop,
    list: async () => [],
    get: async () => null,
    create: refuse(what),
    update: refuse(what),
    remove: refuse(what),
  };
}

/** Where there is no encrypted store (web). Reads are empty, writes refuse. */
export const emptyRepositories: DataRepositories = {
  source: "none",
  hosts: {
    ...emptyRepository("hosts"),
    reorder: refuse("hosts"),
    bulkUpdate: refuse("hosts"),
  },
  hostFolders: { subscribe: noop, list: async () => [] },
  credentials: emptyRepository("logins"),
  snippets: { ...emptyRepository("snippets"), reorder: refuse("snippets") },
  snippetFolders: {
    subscribe: noop,
    list: async () => [],
    create: refuse("snippets"),
    rename: refuse("snippets"),
    remove: refuse("snippets"),
  },
  commandHistory: {
    subscribe: noop,
    list: async () => [],
    merge: async () => {},
    add: async () => {},
    remove: async () => {},
    clear: async () => {},
  },
  recentActivity: {
    subscribe: noop,
    list: async () => [],
    add: async () => {},
  },
  origins: {
    get: async () => undefined,
    set: refuse("hosts"),
  },
  hostPrefs: {
    subscribe: noop,
    get: async () => null,
    set: async () => {},
  },
  metricSamples: {
    append: async () => {},
    range: async () => [],
  },
};

const cache = new Map<string, DataRepositories>();
const serverCache = new WeakMap<AccountClient, DataRepositories>();
const latestClient = new Map<string, AccountClient>();

/**
 * This device and every linked server that syncs use their own encrypted
 * copy. A server that can't sync (no Sync plugin, older Termix) is read live.
 */
export function repositoriesFor(
  account: Account,
  client: AccountClient | null,
): DataRepositories {
  const store = localStores.getState().available;
  const synced =
    account.kind === "server" && account.options?.sync === true && store;
  if (account.kind === "server" && client && !synced) {
    let repos = serverCache.get(client);
    if (!repos) {
      repos = serverRepositories(client, accountStorage(account.id).data);
      serverCache.set(client, repos);
    }
    return repos;
  }
  if (account.kind === "server" && !synced) return emptyRepositories;
  if (!store) return emptyRepositories;
  if (client) latestClient.set(account.id, client);
  let repos = cache.get(account.id);
  if (!repos) {
    repos = localRepositories(account.id);
    if (account.kind === "server") {
      // The server keeps history too, so the web app sees what was typed here.
      const id = account.id;
      repos = {
        ...repos,
        snippets: withSharedSnippets(
          repos.snippets,
          () => latestClient.get(id) ?? null,
        ),
        commandHistory: withServerHistory(
          repos.commandHistory,
          () => latestClient.get(id) ?? null,
        ),
      };
    }
    cache.set(account.id, repos);
  }
  return repos;
}
