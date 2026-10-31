import { AccountClient } from "@/core/api/AccountClient";
import { clearFrameCache } from "@/core/plugins/frame-bundle";
import { localStores } from "@/core/db/stores";
import { AppError } from "@/core/errors";
import {
  accountStorage,
  plainStore,
  type AccountStorage,
  type JsonKV,
} from "@/core/storage/kv";
import {
  LOCAL_ACCOUNT_ID,
  type Account,
  type LocalAccount,
  type ServerAccount,
} from "./types";
import { migrateLegacyServer } from "./migrate";

const STORE_KEY = "accounts.v1";
const LOCAL: LocalAccount = { id: LOCAL_ACCOUNT_ID, kind: "local" };

interface Saved {
  accounts: ServerAccount[];
  activeId: string;
}

export interface AccountStoreDeps {
  kv?: JsonKV;
  storageFor?: (accountId: string) => AccountStorage;
  newId?: () => string;
  now?: () => string;
  /** Deletes the account's encrypted local data. */
  wipeLocalData?: (accountId: string) => Promise<void>;
}

function randomId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (bytes.every((b) => b === 0)) {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function sameServerUrl(a: string, b: string): boolean {
  const clean = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
  return clean(a) === clean(b);
}

/**
 * Holds the account list, the active account and one AccountClient per
 * linked server. The UI reads it through the hooks in ./index.
 */
export class AccountStore {
  private kv: JsonKV;
  private storageFor: (accountId: string) => AccountStorage;
  private newId: () => string;
  private now: () => string;
  private wipeLocalData: (accountId: string) => Promise<void>;

  private servers: ServerAccount[] = [];
  private activeId: string = LOCAL_ACCOUNT_ID;
  private clients = new Map<string, AccountClient>();
  private listeners = new Set<() => void>();
  private ready: Promise<void> | null = null;
  private snapshot: { accounts: Account[]; active: Account } = {
    accounts: [LOCAL],
    active: LOCAL,
  };

  constructor(deps: AccountStoreDeps = {}) {
    this.kv = deps.kv ?? plainStore;
    this.storageFor = deps.storageFor ?? accountStorage;
    this.newId = deps.newId ?? randomId;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.wipeLocalData =
      deps.wipeLocalData ?? ((accountId) => localStores.wipe(accountId));
  }

  /** Loads saved accounts, moving a pre 2.0 server login over once. */
  init(): Promise<void> {
    this.ready ??= (async () => {
      const saved = await this.kv.getJson<Saved>(STORE_KEY);
      if (saved && Array.isArray(saved.accounts)) {
        this.servers = saved.accounts.filter((a) => a?.kind === "server");
        // A link the app was closed in the middle of.
        for (const left of this.servers.filter((a) => a.pending)) {
          await this.wipe(left.id).catch(() => {});
        }
        this.servers = this.servers.filter((a) => !a.pending);
        this.activeId = this.find(saved.activeId)
          ? saved.activeId
          : LOCAL_ACCOUNT_ID;
      } else {
        const migrated = await migrateLegacyServer({
          kv: this.kv,
          storageFor: this.storageFor,
          newId: this.newId,
          now: this.now,
        });
        if (migrated) {
          this.servers = [migrated];
          this.activeId = migrated.id;
        }
        await this.persist();
      }
      this.refreshSnapshot();
      await this.client(this.activeId)?.load();
    })();
    return this.ready;
  }

  // Reading

  /** Stable snapshot for useSyncExternalStore. */
  getSnapshot = () => this.snapshot;

  list(): Account[] {
    return this.snapshot.accounts;
  }

  active(): Account {
    return this.snapshot.active;
  }

  find(id: string): Account | null {
    if (id === LOCAL_ACCOUNT_ID) return LOCAL;
    return this.servers.find((a) => a.id === id) ?? null;
  }

  findByUrl(serverUrl: string): ServerAccount | null {
    return (
      this.servers.find(
        (a) => !a.pending && sameServerUrl(a.serverUrl, serverUrl),
      ) ?? null
    );
  }

  /** The client for a linked server, or null for This device. */
  client(id: string): AccountClient | null {
    const account = this.find(id);
    if (!account || account.kind !== "server") return null;
    let client = this.clients.get(id);
    if (!client || client.serverUrl !== account.serverUrl.replace(/\/+$/, "")) {
      client = new AccountClient({
        accountId: id,
        serverUrl: account.serverUrl,
        storage: this.storageFor(id),
      });
      this.clients.set(id, client);
    }
    return client;
  }

  activeClient(): AccountClient | null {
    return this.client(this.activeId);
  }

  // Writing

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Server accounts still being linked, for the link flow. */
  findPending(serverUrl: string): ServerAccount | null {
    return (
      this.servers.find(
        (a) => a.pending && sameServerUrl(a.serverUrl, serverUrl),
      ) ?? null
    );
  }

  /**
   * Adds a linked server. Like the desktop, it does not switch to it. A
   * pending one stays out of lists until `confirm`.
   */
  async add(
    serverUrl: string,
    opts: { pending?: boolean } = {},
  ): Promise<ServerAccount> {
    const account: ServerAccount = {
      id: this.newId(),
      kind: "server",
      serverUrl: serverUrl.trim().replace(/\/+$/, ""),
      serverName: null,
      serverVersion: null,
      username: null,
      remoteUserId: null,
      isAdmin: false,
      status: "signed_out",
      lastError: null,
      linkedAt: this.now(),
      lastSyncAt: null,
      disabledTypes: [],
      options: {},
      ...(opts.pending ? { pending: true } : {}),
    };
    this.servers = [...this.servers, account];
    await this.commit();
    return account;
  }

  async update(
    id: string,
    patch: Partial<Omit<ServerAccount, "id" | "kind">>,
  ): Promise<ServerAccount> {
    const index = this.servers.findIndex((a) => a.id === id);
    if (index < 0) throw new AppError("No such account", "NOT_FOUND");
    const next = {
      ...this.servers[index],
      ...patch,
      id,
      kind: "server" as const,
    };
    if (patch.serverUrl)
      next.serverUrl = patch.serverUrl.trim().replace(/\/+$/, "");
    this.servers = this.servers.map((a, i) => (i === index ? next : a));
    await this.commit();
    return next;
  }

  async setActive(id: string): Promise<void> {
    if (!this.find(id)) throw new AppError("No such account", "NOT_FOUND");
    this.activeId = id;
    await this.client(id)?.load();
    await this.commit();
  }

  /** A pending account finished linking and shows up in lists. */
  async confirm(id: string): Promise<void> {
    const account = this.servers.find((a) => a.id === id);
    if (!account?.pending) return;
    this.servers = this.servers.map((a) => {
      if (a.id !== id) return a;
      const { pending: _done, ...rest } = a;
      return rest;
    });
    await this.commit();
  }

  /** Drops a pending account and anything saved for it. */
  async discardPending(id: string): Promise<void> {
    const account = this.servers.find((a) => a.id === id);
    if (!account?.pending || id === this.activeId) return;
    await this.wipe(id);
    this.servers = this.servers.filter((a) => a.id !== id);
    await this.commit();
  }

  private async wipe(id: string): Promise<void> {
    const client = this.client(id);
    await client?.wipe();
    clearFrameCache(id);
    await this.wipeLocalData(id);
    this.clients.delete(id);
  }

  /** Removes a linked server and wipes its data. This device stays. */
  async remove(id: string): Promise<void> {
    if (id === LOCAL_ACCOUNT_ID) {
      throw new AppError("This device can't be removed", "VALIDATION_ERROR");
    }
    if (id === this.activeId) {
      throw new AppError("Switch to another account first", "VALIDATION_ERROR");
    }
    if (!this.find(id)) throw new AppError("No such account", "NOT_FOUND");
    await this.wipe(id);
    this.servers = this.servers.filter((a) => a.id !== id);
    await this.commit();
  }

  private async commit(): Promise<void> {
    await this.persist();
    this.refreshSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  private persist(): Promise<void> {
    return this.kv.setJson(STORE_KEY, {
      accounts: this.servers,
      activeId: this.activeId,
    } satisfies Saved);
  }

  private refreshSnapshot(): void {
    this.snapshot = {
      accounts: [LOCAL, ...this.servers.filter((a) => !a.pending)],
      active: this.find(this.activeId) ?? LOCAL,
    };
  }
}
