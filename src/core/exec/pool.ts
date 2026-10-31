import { sessionLifecycle } from "@/core/sessions/lifecycle";
import type { HostSession } from "@/core/transport";

interface Entry {
  session: Promise<HostSession> | null;
  refs: number;
  idle: ReturnType<typeof setTimeout> | null;
  stopWatch: (() => void) | null;
}

export interface Lease {
  /** The shared session, opened on first use. */
  session(): Promise<HostSession>;
  /** Drops a session that failed, so the next call opens a fresh one. */
  invalidate(stale: Promise<HostSession>): void;
  release(): void;
}

const IDLE_MS = 60_000;

/**
 * One logged in connection per host for every exec feature, so a screen,
 * its cards and a poll share it. Closed a minute after the last user lets
 * go, and all at once when the app leaves the foreground.
 */
export class ExecPool {
  private entries = new Map<string, Entry>();

  constructor(private readonly idleMs = IDLE_MS) {}

  acquire(key: string, open: () => Promise<HostSession>): Lease {
    const entry = this.entries.get(key) ?? {
      session: null,
      refs: 0,
      idle: null,
      stopWatch: null,
    };
    this.entries.set(key, entry);
    entry.refs++;
    if (entry.idle) {
      clearTimeout(entry.idle);
      entry.idle = null;
    }
    let released = false;
    return {
      session: () => {
        if (!entry.session) {
          const opening = open();
          entry.session = opening;
          opening.then(
            (s) => {
              entry.stopWatch = s.ssh.onDisconnect(() =>
                this.drop(entry, opening),
              );
            },
            () => this.drop(entry, opening),
          );
        }
        return entry.session;
      },
      invalidate: (stale) => this.drop(entry, stale),
      release: () => {
        if (released) return;
        released = true;
        entry.refs--;
        if (entry.refs > 0) return;
        entry.idle = setTimeout(() => this.close(key), this.idleMs);
      },
    };
  }

  /** Closes every connection. Leases stay valid and reopen on next use. */
  closeAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.session) this.drop(entry, entry.session);
    }
  }

  /** Closes everything and forgets every host, timers included. Test seam. */
  dispose(): void {
    for (const entry of this.entries.values()) {
      if (entry.idle) clearTimeout(entry.idle);
      if (entry.session) this.drop(entry, entry.session);
    }
    this.entries.clear();
  }

  size(): number {
    return [...this.entries.values()].filter((e) => e.session).length;
  }

  private drop(entry: Entry, stale: Promise<HostSession>) {
    if (entry.session !== stale) return;
    entry.session = null;
    entry.stopWatch?.();
    entry.stopWatch = null;
    stale.then((s) => s.close()).catch(() => {});
  }

  private close(key: string) {
    const entry = this.entries.get(key);
    if (!entry || entry.refs > 0) return;
    if (entry.session) this.drop(entry, entry.session);
    this.entries.delete(key);
  }
}

export const execPool = new ExecPool();

// Polls stop in the background, so their connections can go too.
sessionLifecycle.register({ notifyBackgrounded: () => execPool.closeAll() });
