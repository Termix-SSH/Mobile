import { protectDirectory } from "@/modules/file-protection";
import { AppError } from "@/core/errors";
import { createLogger } from "@/core/log/logger";
import {
  createBackup,
  openBackup,
  restoreTables,
  type KdfParams,
} from "./backup";
import { changes } from "./changes";
import type { DbDriver, OpenedDb } from "./driver";
import { expoDriver } from "./expo-driver";
import { deleteDbKey, getDbKey } from "./keys";
import { migrate } from "./migrate";

const log = createLogger("db");

export interface StoreState {
  /** False on web, where there is no encrypted store. */
  available: boolean;
  /** True once App Lock let the keys out. */
  unlocked: boolean;
}

/**
 * One encrypted database per account, opened on first use. Nothing reads a
 * key until `unlock()`, which App Lock calls once the user is through it.
 */
export class LocalStores {
  private driver: DbDriver | null;
  private opened = new Map<string, OpenedDb>();
  private opening = new Map<string, Promise<OpenedDb>>();
  private stopChanges: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private state: StoreState;

  constructor(driver: DbDriver | null) {
    this.driver = driver;
    this.state = { available: !!driver, unlocked: false };
  }

  /** Test seam. Closes anything open. */
  setDriver(driver: DbDriver | null): void {
    this.closeAll();
    this.driver = driver;
    this.setState({ available: !!driver, unlocked: false });
  }

  static fileName(accountId: string): string {
    return `termix-${accountId.replace(/[^A-Za-z0-9_-]/g, "_")}.db`;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): StoreState => this.state;

  private setState(next: StoreState) {
    if (
      next.available === this.state.available &&
      next.unlocked === this.state.unlocked
    )
      return;
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  unlock(): void {
    if (!this.driver) return;
    this.setState({ ...this.state, unlocked: true });
  }

  /** Closes every file. Keys stay in the Keychain but are not read again until unlock. */
  lock(): void {
    this.closeAll();
    this.setState({ ...this.state, unlocked: false });
  }

  isOpen(accountId: string): boolean {
    return this.opened.has(accountId);
  }

  get(accountId: string): Promise<OpenedDb> {
    return this.open(accountId, true);
  }

  /**
   * Opens a linked server's copy for sync, also while App Lock is locked.
   * It only holds what is on that server anyway. This device is never opened
   * this way.
   */
  openForSync(accountId: string): Promise<OpenedDb> {
    if (accountId === "local") {
      return Promise.reject(
        new AppError("This device does not sync.", "NO_LOCAL_STORE"),
      );
    }
    return this.open(accountId, false);
  }

  private async open(
    accountId: string,
    needsUnlock: boolean,
  ): Promise<OpenedDb> {
    const driver = this.driver;
    if (!driver) {
      throw new AppError("Local data is not available here.", "NO_LOCAL_STORE");
    }
    const locked = () => needsUnlock && !this.state.unlocked;
    if (locked()) {
      throw new AppError("Unlock Termix first.", "APP_LOCKED");
    }
    const open = this.opened.get(accountId);
    if (open) return open;
    const pending = this.opening.get(accountId);
    if (pending) return pending;

    const task = (async () => {
      const key = await getDbKey(accountId);
      if (locked() || this.driver !== driver) {
        throw new AppError("Unlock Termix first.", "APP_LOCKED");
      }
      await driver.prepare?.(LocalStores.fileName(accountId)).catch(() => {});
      if (locked() || this.driver !== driver) {
        throw new AppError("Unlock Termix first.", "APP_LOCKED");
      }
      const db = driver.open(LocalStores.fileName(accountId), key);
      try {
        migrate(db.raw);
      } catch (error) {
        db.raw.close();
        throw error;
      }
      if (db.path) protectDirectory(db.path.replace(/[/\\][^/\\]+$/, ""));
      this.watchChanges(driver);
      this.opened.set(accountId, db);
      return db;
    })();
    this.opening.set(accountId, task);
    try {
      return await task;
    } catch (error) {
      log.error("Could not open local data", { errorCode: errorCode(error) });
      throw error;
    } finally {
      this.opening.delete(accountId);
    }
  }

  close(accountId: string): void {
    const db = this.opened.get(accountId);
    this.opened.delete(accountId);
    try {
      db?.raw.close();
    } catch {}
  }

  /** Deletes the account's file and its key. The next `get` starts empty. */
  async wipe(accountId: string): Promise<void> {
    await this.opening.get(accountId)?.catch(() => {});
    this.close(accountId);
    try {
      this.driver?.remove(LocalStores.fileName(accountId));
    } catch (error) {
      log.warn("Could not delete local data file", {
        errorCode: errorCode(error),
      });
    }
    await deleteDbKey(accountId);
    changes.emitAll(accountId);
  }

  /** The account's data as an encrypted backup file's text. */
  async exportBackup(
    accountId: string,
    passphrase: string,
    kdf?: KdfParams,
  ): Promise<string> {
    const { raw } = await this.get(accountId);
    return createBackup(raw, passphrase, kdf);
  }

  /** Replaces all of the account's data with the backup's. */
  async importBackup(
    accountId: string,
    content: string,
    passphrase: string,
  ): Promise<void> {
    const dump = await openBackup(content, passphrase);
    const { raw } = await this.get(accountId);
    restoreTables(raw, dump);
    changes.emitAll(accountId);
  }

  private closeAll(): void {
    for (const id of [...this.opened.keys()]) this.close(id);
    this.stopChanges?.();
    this.stopChanges = null;
  }

  private watchChanges(driver: DbDriver): void {
    if (this.stopChanges || !driver.onChange) return;
    this.stopChanges = driver.onChange((name, table) => {
      for (const id of this.opened.keys()) {
        if (name.endsWith(LocalStores.fileName(id))) changes.emit(id, table);
      }
    });
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof AppError ? String(error.code) : undefined;
}

export const localStores = new LocalStores(expoDriver);
