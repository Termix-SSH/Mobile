import { AppState, type AppStateStatus } from "react-native";
import { accounts } from "@/core/accounts";
import { isServerAccount, type ServerAccount } from "@/core/accounts/types";
import { changes } from "@/core/db/changes";
import { localStores, type LocalStores } from "@/core/db/stores";
import { createLogger } from "@/core/log/logger";
import { SyncEngine, type PassSummary } from "./engine";
import { EDITABLE_TABLES } from "./entities";
import { classifyRemoteError, needsUser, SyncError } from "./errors";
import { pinMismatch } from "@/core/api/pins";
import { peekServerKey } from "@/modules/termix-net";
import { openEventStream } from "./events";
import { fillServerIds } from "./host-ids";
import { mergeThisDevice } from "./link";
import { REFRESH_EVERY_MS } from "./protocol";
import { isSessionEnded, reasonOf } from "./reasons";
import { SyncRemote } from "./remote";

const log = createLogger("sync");

/** How many servers sync at the same time. */
const MAX_PARALLEL = 2;
/** Servers that keep a live event stream open while the app is open. */
const MAX_STREAMS = 3;
// Also catches pushes from other devices, which send no event yet
// (Termix-SSH/Plugin-Sync#1).
const POLL_MS = 5 * 60_000;
const LOCAL_EDIT_DELAY_MS = 2_000;
const EVENT_DELAY_MS = 500;
const STREAM_RETRY_MS = 30_000;
const BACKOFF_START_MS = 15_000;
const BACKOFF_MAX_MS = 10 * 60_000;

export type SyncState =
  "idle" | "syncing" | "offline" | "error" | "signed_out" | "off";

export interface AccountSync {
  state: SyncState;
  /** A reason code from reasons.ts, or null. */
  reason: string | null;
  lastSyncAt: string | null;
  /** True while the event stream is open. */
  live: boolean;
  last?: PassSummary;
}

const OFF: AccountSync = {
  state: "off",
  reason: null,
  lastSyncAt: null,
  live: false,
};

interface Slot {
  engine: SyncEngine;
  running: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  backoff: number;
  closeStream: (() => void) | null;
  stopWatch: () => void;
  again: boolean;
  /** A delayed pass asked for while one ran (backoff, poll). */
  later: number | null;
  /** syncNow callers waiting for the next pass to finish. */
  waiting: (() => void)[];
}

/** Whether an account syncs at all: linked with sync and signed in. */
export function syncs(account: ServerAccount): boolean {
  return (
    account.options.sync === true &&
    !!accounts.client(account.id)?.isAuthenticated()
  );
}

/**
 * Keeps every linked server in sync while the app runs: a pass on start,
 * after local edits, when the server says something changed, every few
 * minutes as a fallback, and with backoff when it can't reach the server.
 */
export class SyncManager {
  private slots = new Map<string, Slot>();
  private status = new Map<string, AccountSync>();
  private listeners = new Set<() => void>();
  private queue: string[] = [];
  private busy = 0;
  private foreground = AppState.currentState !== "background";
  private stopAccounts: (() => void) | null = null;
  private stopAppState: { remove(): void } | null = null;

  constructor(private readonly stores: LocalStores = localStores) {}

  start(): void {
    if (this.stopAccounts) return;
    this.stopAccounts = accounts.subscribe(() => this.reconcile());
    this.stopAppState = AppState.addEventListener("change", (s) =>
      this.onAppState(s),
    );
    this.reconcile();
    this.syncAll();
  }

  stop(): void {
    this.stopAccounts?.();
    this.stopAppState?.remove();
    this.stopAccounts = null;
    this.stopAppState = null;
    for (const id of [...this.slots.keys()]) this.drop(id);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get(accountId: string): AccountSync {
    return this.status.get(accountId) ?? OFF;
  }

  /** Runs a pass now (or right after the one running). */
  syncNow(accountId: string): Promise<void> {
    const slot = this.slot(accountId);
    if (!slot) return Promise.resolve();
    const done = new Promise<void>((resolve) => slot.waiting.push(resolve));
    this.schedule(accountId, 0);
    return done;
  }

  syncAll(): void {
    for (const id of this.slots.keys()) this.schedule(id, 0);
  }

  /**
   * The first sync after linking. Merge brings This device's own data along
   * once the server's rows are here, so lookalikes are not copied twice.
   */
  async firstSync(accountId: string, merge: boolean): Promise<void> {
    await this.syncNow(accountId);
    if (merge && this.get(accountId).state === "idle") {
      await mergeThisDevice(accountId, this.stores);
      await this.syncNow(accountId);
    }
  }

  /** Stops syncing an account, before it is unlinked. */
  forget(accountId: string): void {
    this.drop(accountId);
    this.status.delete(accountId);
    this.emit();
  }

  /**
   * One pass per linked server in a background task, within the time the
   * system gives us. Accounts whose key can't be read yet are skipped.
   */
  async runInBackground(budgetMs: number): Promise<number> {
    this.reconcile();
    const deadline = Date.now() + budgetMs;
    let done = 0;
    for (const id of [...this.slots.keys()]) {
      const left = deadline - Date.now();
      if (left < 3_000) break;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finished = await Promise.race([
        this.syncNow(id).then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), left);
        }),
      ]);
      clearTimeout(timer);
      if (finished) done++;
    }
    return done;
  }

  // Accounts

  private reconcile(): void {
    const wanted = new Map<string, ServerAccount>();
    for (const account of accounts.list()) {
      if (isServerAccount(account) && syncs(account))
        wanted.set(account.id, account);
    }
    for (const id of [...this.slots.keys()]) {
      if (!wanted.has(id)) this.drop(id);
    }
    for (const account of wanted.values()) {
      if (this.slots.has(account.id)) continue;
      this.slots.set(account.id, this.makeSlot(account));
      // Linked while the app runs: sync it right away.
      if (this.stopAccounts) this.schedule(account.id, 0);
      this.setStatus(account.id, {
        state: "idle",
        reason: null,
        lastSyncAt: account.lastSyncAt,
        live: false,
      });
    }
    // Accounts that stopped syncing keep showing why.
    for (const account of accounts.list()) {
      if (!isServerAccount(account) || wanted.has(account.id)) continue;
      if (account.options.sync === true && account.status === "signed_out") {
        this.setStatus(account.id, {
          state: "signed_out",
          reason: account.lastError,
          lastSyncAt: account.lastSyncAt,
          live: false,
        });
      }
    }
    this.restream();
  }

  private makeSlot(account: ServerAccount): Slot {
    const id = account.id;
    const engine = new SyncEngine({
      open: () => this.stores.openForSync(id),
      remote: new SyncRemote(accounts.client(id)!),
      disabledTypes: () =>
        accounts.find(id)?.kind === "server"
          ? (accounts.find(id) as ServerAccount).disabledTypes
          : [],
      onProfile: (row) => {
        void accounts
          .update(id, {
            ...(typeof row.username === "string"
              ? { username: row.username }
              : {}),
            isAdmin: !!row.isAdmin,
          })
          .catch(() => {});
      },
      emit: (tables) => tables.forEach((t) => changes.emit(id, t)),
    });
    const stopWatch = changes.subscribe(id, EDITABLE_TABLES, () => {
      const slot = this.slots.get(id);
      if (slot && !slot.running) this.schedule(id, LOCAL_EDIT_DELAY_MS);
    });
    return {
      engine,
      running: null,
      timer: null,
      backoff: 0,
      closeStream: null,
      stopWatch,
      again: false,
      later: null,
      waiting: [],
    };
  }

  private slot(accountId: string): Slot | undefined {
    return this.slots.get(accountId);
  }

  private drop(accountId: string): void {
    const slot = this.slots.get(accountId);
    if (!slot) return;
    if (slot.timer) clearTimeout(slot.timer);
    slot.closeStream?.();
    slot.stopWatch();
    slot.waiting.splice(0).forEach((resolve) => resolve());
    this.slots.delete(accountId);
    this.queue = this.queue.filter((id) => id !== accountId);
  }

  // Scheduling

  private schedule(accountId: string, delayMs: number): void {
    const slot = this.slot(accountId);
    if (!slot) return;
    if (slot.running) {
      // Asked during a pass: soon means once more right after it, later
      // (backoff, polling) means a timer once it ends.
      if (delayMs < BACKOFF_START_MS) slot.again = true;
      else slot.later = Math.min(slot.later ?? delayMs, delayMs);
      return;
    }
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = setTimeout(() => {
      slot.timer = null;
      this.enqueue(accountId);
    }, delayMs);
  }

  private enqueue(accountId: string): void {
    if (!this.queue.includes(accountId)) this.queue.push(accountId);
    this.drain();
  }

  private drain(): void {
    while (this.busy < MAX_PARALLEL && this.queue.length) {
      const id = this.queue.shift()!;
      const slot = this.slot(id);
      if (!slot || slot.running) continue;
      this.busy++;
      const waiting = slot.waiting.splice(0);
      slot.running = this.run(id, slot).finally(() => {
        slot.running = null;
        this.busy--;
        waiting.forEach((resolve) => resolve());
        const later = slot.later;
        slot.later = null;
        if (this.slots.get(id) === slot) {
          if (slot.again) {
            slot.again = false;
            this.enqueue(id);
          } else if (later !== null) {
            this.schedule(id, later);
          }
        }
        this.drain();
      });
    }
  }

  private async run(accountId: string, slot: Slot): Promise<void> {
    const account = accounts.find(accountId);
    if (!isServerAccount(account)) return;
    const prev = this.get(accountId);
    this.setStatus(accountId, { ...prev, state: "syncing" });
    try {
      await this.refreshSession(account);
      const summary = await slot.engine.pass();
      slot.backoff = 0;
      const now = new Date().toISOString();
      await accounts.update(accountId, {
        status: "idle",
        lastError: null,
        lastSyncAt: now,
      });
      this.setStatus(accountId, {
        state: "idle",
        reason: null,
        lastSyncAt: now,
        live: !!slot.closeStream,
        last: summary,
      });
      this.restream();
      // Even with a live stream: pushes from other devices send no event yet.
      if (this.foreground) {
        this.schedule(accountId, POLL_MS);
      }
      void fillServerIds(accountId, 50, this.stores).catch(() => {});
    } catch (error) {
      await this.fail(accountId, slot, error);
    }
  }

  private async fail(
    accountId: string,
    slot: Slot,
    error: unknown,
  ): Promise<void> {
    let sync = error instanceof SyncError ? error : classifyRemoteError(error);
    // A refused pin looks like any failed connection, so ask the server.
    const client = accounts.client(accountId);
    if (
      (sync.kind === "offline" || sync.kind === "tls") &&
      client &&
      (await pinMismatch(client.rootBase(), client.certPins(), peekServerKey))
    ) {
      sync = new SyncError(
        "pin_mismatch",
        "The server shows another key than the pinned one.",
      );
    }
    const reason = reasonOf(sync);
    log.warn("Sync pass failed", {
      operation: "sync_pass",
      errorCode: sync.kind,
    });
    if (isSessionEnded(reason)) {
      // The session is gone for good. Stop here instead of retrying.
      await accounts.update(accountId, {
        status: "signed_out",
        lastError: reason,
      });
      accounts.client(accountId)?.notifyAuthLost();
      this.setStatus(accountId, {
        ...this.get(accountId),
        state: "signed_out",
        reason,
        live: false,
      });
      return;
    }
    const offline = sync.kind === "offline";
    await accounts
      .update(accountId, {
        status: offline ? "offline" : "error",
        lastError: reason,
      })
      .catch(() => {});
    this.setStatus(accountId, {
      ...this.get(accountId),
      state: offline ? "offline" : "error",
      reason,
      live: false,
    });
    slot.closeStream?.();
    slot.closeStream = null;
    // Problems a person has to fix wait for them, or the next app open.
    if (needsUser(sync.kind) || !this.foreground) return;
    slot.backoff = slot.backoff
      ? Math.min(slot.backoff * 2, BACKOFF_MAX_MS)
      : BACKOFF_START_MS;
    this.schedule(accountId, slot.backoff);
  }

  /** Renews the device session once a day when it is near its end. */
  private async refreshSession(account: ServerAccount): Promise<void> {
    const checked = Date.parse(String(account.options.refreshCheckedAt ?? ""));
    if (Number.isFinite(checked) && Date.now() - checked < REFRESH_EVERY_MS) {
      return;
    }
    const client = accounts.client(account.id);
    if (!client) return;
    const token = await new SyncRemote(client).refresh();
    // The server ends the old session at once, so save the new one first
    // (Termix-SSH/Plugin-Sync#2).
    if (token) await client.setToken(token);
    await accounts.update(account.id, {
      options: {
        ...(accounts.find(account.id) as ServerAccount).options,
        refreshCheckedAt: new Date().toISOString(),
      },
    });
  }

  // Event streams

  /** Live streams for the first few servers, the active one first. */
  private restream(): void {
    const activeId = accounts.active().id;
    const order = [...this.slots.keys()].sort(
      (a, b) => Number(b === activeId) - Number(a === activeId),
    );
    order.forEach((id, index) => {
      const slot = this.slots.get(id)!;
      const want =
        this.foreground &&
        index < MAX_STREAMS &&
        this.get(id).state === "idle" &&
        !!this.get(id).lastSyncAt;
      if (want && !slot.closeStream) this.openStream(id, slot);
      if (!want && slot.closeStream) {
        slot.closeStream();
        slot.closeStream = null;
      }
    });
  }

  private openStream(accountId: string, slot: Slot): void {
    const client = accounts.client(accountId);
    if (!client) return;
    const request = new SyncRemote(client).eventsRequest();
    slot.closeStream = openEventStream({
      url: request.url,
      headers: request.headers,
      native: client.usesNativeNetwork(),
      onOpen: () =>
        this.setStatus(accountId, { ...this.get(accountId), live: true }),
      onEvent: (event) => {
        if (event.event === "change") this.schedule(accountId, EVENT_DELAY_MS);
      },
      onClose: () => {
        if (this.slots.get(accountId) !== slot) return;
        slot.closeStream = null;
        this.setStatus(accountId, { ...this.get(accountId), live: false });
        // The next good pass opens it again.
        if (this.foreground) this.schedule(accountId, STREAM_RETRY_MS);
      },
    });
  }

  private onAppState(next: AppStateStatus): void {
    const foreground = next === "active";
    if (foreground === this.foreground) return;
    this.foreground = foreground;
    if (!foreground) {
      for (const slot of this.slots.values()) {
        if (slot.timer) clearTimeout(slot.timer);
        slot.timer = null;
        slot.closeStream?.();
        slot.closeStream = null;
      }
      return;
    }
    this.syncAll();
  }

  private setStatus(accountId: string, next: AccountSync): void {
    this.status.set(accountId, next);
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const sync = new SyncManager();
