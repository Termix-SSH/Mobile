type Listener = () => void;

/**
 * Tells live lists that a table changed. Repositories call it after their
 * writes, and the native change hook calls it for anything else (sync).
 */
export class ChangeFeed {
  private listeners = new Map<string, Set<Listener>>();

  private key(accountId: string, table: string) {
    return `${accountId}\u0000${table}`;
  }

  subscribe(accountId: string, tables: string[], listener: Listener) {
    const keys = tables.map((table) => this.key(accountId, table));
    for (const key of keys) {
      if (!this.listeners.has(key)) this.listeners.set(key, new Set());
      this.listeners.get(key)!.add(listener);
    }
    return () => {
      for (const key of keys) this.listeners.get(key)?.delete(listener);
    };
  }

  emit(accountId: string, table: string) {
    for (const listener of [
      ...(this.listeners.get(this.key(accountId, table)) ?? []),
    ]) {
      try {
        listener();
      } catch {}
    }
  }

  /** Every listener of the account, after a restore or a wipe. */
  emitAll(accountId: string) {
    const prefix = `${accountId}\u0000`;
    const all = new Set<Listener>();
    for (const [key, set] of this.listeners) {
      if (key.startsWith(prefix)) set.forEach((l) => all.add(l));
    }
    all.forEach((listener) => {
      try {
        listener();
      } catch {}
    });
  }
}

export const changes = new ChangeFeed();
