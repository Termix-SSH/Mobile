/**
 * Host status from the phone when no server reports it: a TCP connect to
 * the SSH port, like the Host Status plugin. Two misses in a row mean offline.
 */
import type { SSHHost } from "@/types";

export type LocalStatus = "online" | "offline";

export const DEFAULT_INTERVAL_SECS = 30;
export const MIN_INTERVAL_SECS = 5;
export const MAX_PARALLEL = 8;
const PROBE_TIMEOUT_MS = 4000;
const EMIT_GAP_MS = 500;

type ProbeHost = Pick<
  SSHHost,
  | "id"
  | "ip"
  | "port"
  | "sshPort"
  | "jumpHosts"
  | "statusCheckEnabled"
  | "statusCheckInterval"
>;

/** Whether the phone can check this host by dialing it. */
export function probeTarget(
  host: ProbeHost,
): { host: string; port: number } | null {
  if (host.statusCheckEnabled === false) return null;
  // Behind a jump host the phone usually can't dial it directly.
  if (host.jumpHosts?.length) return null;
  const address = host.ip?.trim();
  const port = Number(host.sshPort || host.port) || 22;
  if (!address || port < 1 || port > 65535) return null;
  return { host: address, port };
}

export function intervalMs(host: ProbeHost): number {
  const secs = Number(host.statusCheckInterval);
  const value =
    Number.isFinite(secs) && secs > 0 ? secs : DEFAULT_INTERVAL_SECS;
  return Math.max(MIN_INTERVAL_SECS, value) * 1000;
}

interface Entry {
  host: ProbeHost;
  misses: number;
  status: LocalStatus | null;
  nextAt: number;
  busy: boolean;
}

export type Probe = (
  host: string,
  port: number,
  timeoutMs: number,
) => Promise<boolean>;

export class LocalStatusMonitor {
  private entries = new Map<number, Entry>();
  private listeners = new Set<() => void>();
  private pending = false;
  private lastEmit = -Infinity;

  constructor(
    private probe: Probe,
    private now: () => number = Date.now,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Keeps known hosts' history, drops removed hosts and hosts that can't be checked. */
  setHosts(hosts: ProbeHost[]): void {
    const keep = new Set<number>();
    for (const host of hosts) {
      if (!probeTarget(host)) continue;
      keep.add(host.id);
      const entry = this.entries.get(host.id);
      if (entry) entry.host = host;
      else {
        this.entries.set(host.id, {
          host,
          misses: 0,
          status: null,
          nextAt: 0,
          busy: false,
        });
      }
    }
    let changed = false;
    for (const id of [...this.entries.keys()]) {
      if (!keep.has(id)) {
        this.entries.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  snapshot(): Record<number, LocalStatus> {
    const out: Record<number, LocalStatus> = {};
    for (const [id, e] of this.entries) if (e.status) out[id] = e.status;
    return out;
  }

  /** Probes every host that is due, at most MAX_PARALLEL at once. Resolves when done. */
  async tick(): Promise<void> {
    const now = this.now();
    const due = [...this.entries.values()].filter(
      (e) => !e.busy && e.nextAt <= now,
    );
    let index = 0;
    const worker = async () => {
      while (index < due.length) {
        const entry = due[index++];
        await this.check(entry);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL, due.length) }, worker),
    );
    if (this.pending) this.emit();
  }

  /** Makes every host due now, for pull to refresh or coming back to the app. */
  refresh(): void {
    for (const e of this.entries.values()) e.nextAt = 0;
  }

  private async check(entry: Entry): Promise<void> {
    const target = probeTarget(entry.host);
    if (!target) return;
    entry.busy = true;
    let ok = false;
    try {
      ok = await this.probe(target.host, target.port, PROBE_TIMEOUT_MS);
    } catch {
      ok = false;
    }
    entry.busy = false;
    entry.nextAt = this.now() + intervalMs(entry.host);
    const before = entry.status;
    if (ok) {
      entry.misses = 0;
      entry.status = "online";
    } else {
      entry.misses++;
      if (entry.misses >= 2) entry.status = "offline";
      else if (entry.status === null) {
        // One miss on the first look: look again soon before saying offline.
        entry.nextAt = this.now() + 2000;
      }
    }
    if (entry.status !== before) this.changed();
  }

  // A tick over many hosts sends one update per EMIT_GAP_MS, not one per host.
  private changed() {
    this.pending = true;
    if (this.now() - this.lastEmit >= EMIT_GAP_MS) this.emit();
  }

  private emit() {
    this.pending = false;
    this.lastEmit = this.now();
    this.listeners.forEach((l) => l());
  }
}
