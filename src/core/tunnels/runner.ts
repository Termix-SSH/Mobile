import type { SshForward } from "@/modules/termix-ssh";
import type { HostSession } from "@/core/transport/types";
import { reconnectDelay } from "@/core/transport/reconnect";
import type { TunnelConnection, TunnelStatus } from "@/types";

export const IOS_STOPPED =
  "iOS stopped this tunnel while the app was in the background. Start it again to open it.";

const STATE_TEXT: Record<string, string> = {
  connecting: "Connecting",
  connected: "Connected",
  retrying: "Retrying",
  waiting: "Waiting",
  failed: "Failed",
};

export const tunnelStateText = (state?: string) =>
  STATE_TEXT[state ?? ""] ?? "Starting";

export interface TunnelJob {
  /** Same name the Tunnels plugin would use, so both sides line up. */
  key: string;
  hostId: number;
  hostName: string;
  tunnel: TunnelConnection;
  open(): Promise<HostSession>;
}

interface Entry {
  job: TunnelJob;
  session: HostSession | null;
  forwards: SshForward[];
  timer: ReturnType<typeof setTimeout> | null;
  tries: number;
  stopped: boolean;
  unwatch: (() => void) | null;
}

interface Deps {
  platform: string;
}

const DEFAULT_RETRY_SECS = 10;

/** Opens the forward for one tunnel on an open session. */
export async function openForwards(
  session: HostSession,
  t: TunnelConnection,
): Promise<SshForward[]> {
  const bind = t.bindHost || "127.0.0.1";
  const target = t.targetHost || "127.0.0.1";
  switch (t.mode ?? t.tunnelType ?? "local") {
    case "dynamic":
      return [await session.ssh.forwardDynamic(t.sourcePort, bind)];
    case "remote":
      // The host listens on the endpoint port and sends it to the phone side.
      return [
        await session.ssh.forwardRemote(
          t.endpointPort,
          target,
          t.sourcePort,
          "127.0.0.1",
        ),
      ];
    default:
      return [
        await session.ssh.forwardLocal(
          t.sourcePort,
          target,
          t.endpointPort,
          bind,
        ),
      ];
  }
}

/**
 * Runs tunnels on the phone with the native SSH engine. Reports the same
 * statuses as the server so one screen shows both. It owns its retries, since
 * a dropped session does not reconnect itself.
 */
export class LocalTunnelRunner {
  private entries = new Map<string, Entry>();
  private statuses: Record<string, TunnelStatus> = {};
  private listeners = new Set<() => void>();
  private away = false;
  private online = true;
  private lowPower = false;

  constructor(private deps: Deps = { platform: "android" }) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getSnapshot = (): Readonly<Record<string, TunnelStatus>> => this.statuses;

  /** Running or trying tunnels, for the notification. */
  active(): { key: string; hostName: string; status: TunnelStatus }[] {
    return [...this.entries.values()]
      .filter((e) => !e.stopped)
      .map((e) => ({
        key: e.job.key,
        hostName: e.job.hostName,
        status: this.statuses[e.job.key],
      }));
  }

  start(job: TunnelJob) {
    this.stop(job.key);
    const entry: Entry = {
      job,
      session: null,
      forwards: [],
      timer: null,
      tries: 0,
      stopped: false,
      unwatch: null,
    };
    this.entries.set(job.key, entry);
    void this.attempt(entry);
  }

  stop(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.stopped = true;
    this.entries.delete(key);
    this.release(entry);
    this.set(key, {
      connected: false,
      status: "disconnected",
      manualDisconnect: true,
    });
  }

  stopAll() {
    [...this.entries.keys()].forEach((k) => this.stop(k));
  }

  /** Stops the tunnels of a host, as when its session closes. */
  stopHost(hostId: number) {
    for (const e of [...this.entries.values()]) {
      if (e.job.hostId === hostId) this.stop(e.job.key);
    }
  }

  private set(key: string, status: TunnelStatus) {
    this.statuses = { ...this.statuses, [key]: status };
    this.listeners.forEach((l) => l());
  }

  private release(entry: Entry) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.unwatch?.();
    entry.unwatch = null;
    const { forwards, session } = entry;
    entry.forwards = [];
    entry.session = null;
    forwards.forEach((f) => f.close().catch(() => {}));
    session?.close().catch(() => {});
  }

  private async attempt(entry: Entry) {
    if (entry.stopped) return;
    const { key, tunnel } = entry.job;
    if (!this.online) {
      this.set(key, {
        connected: false,
        status: "waiting",
        reason: "Waiting for network",
      });
      return;
    }
    this.set(key, {
      connected: false,
      status: entry.tries > 0 ? "retrying" : "connecting",
      retryCount: entry.tries,
      maxRetries: tunnel.maxRetries,
    });
    try {
      const session = await entry.job.open();
      if (entry.stopped) {
        session.close().catch(() => {});
        return;
      }
      entry.session = session;
      entry.forwards = await openForwards(session, tunnel);
      if (entry.stopped) return this.release(entry);
      entry.tries = 0;
      entry.unwatch = session.ssh.onDisconnect((info) =>
        this.dropped(entry, info.reason),
      );
      this.set(key, { connected: true, status: "connected" });
    } catch (err) {
      this.release(entry);
      this.fail(entry, (err as Error)?.message || "Could not open the tunnel");
    }
  }

  private dropped(entry: Entry, reason?: string) {
    if (entry.stopped) return;
    this.release(entry);
    if (this.deps.platform === "ios" && this.away) {
      this.giveUp(entry, IOS_STOPPED);
      return;
    }
    this.fail(entry, reason || "The connection dropped");
  }

  private giveUp(entry: Entry, reason: string) {
    this.entries.delete(entry.job.key);
    entry.stopped = true;
    this.set(entry.job.key, { connected: false, status: "failed", reason });
  }

  private fail(entry: Entry, reason: string) {
    const { key, tunnel } = entry.job;
    if (entry.stopped) return;
    if (!this.online) {
      this.set(key, { connected: false, status: "waiting", reason });
      return;
    }
    entry.tries += 1;
    const max = tunnel.maxRetries ?? 0;
    if (entry.tries > max) {
      this.entries.delete(key);
      entry.stopped = true;
      this.set(key, {
        connected: false,
        status: "failed",
        reason,
        retryCount: Math.max(entry.tries - 1, 0),
        maxRetries: max,
        retryExhausted: max > 0,
      });
      return;
    }
    const wait = Math.max(
      (tunnel.retryInterval || DEFAULT_RETRY_SECS) * 1000,
      reconnectDelay(entry.tries, { lowPower: this.lowPower }),
    );
    this.set(key, {
      connected: false,
      status: "waiting",
      reason,
      retryCount: entry.tries,
      maxRetries: max,
      nextRetryIn: wait,
    });
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.attempt(entry);
    }, wait);
  }

  notifyBackgrounded() {
    this.away = true;
  }

  notifyForegrounded() {
    this.away = false;
    for (const entry of [...this.entries.values()]) {
      const session = entry.session;
      if (!session || entry.stopped) continue;
      session.ssh.ping(5).catch(() => {
        if (entry.session !== session || entry.stopped) return;
        this.release(entry);
        if (this.deps.platform === "ios") this.giveUp(entry, IOS_STOPPED);
        else this.fail(entry, "The connection dropped");
      });
    }
  }

  notifyNetworkChanged(info: { connected: boolean }) {
    const was = this.online;
    this.online = info.connected;
    if (!info.connected) {
      for (const e of this.entries.values()) {
        if (!e.timer) continue;
        clearTimeout(e.timer);
        e.timer = null;
        this.set(e.job.key, {
          connected: false,
          status: "waiting",
          reason: "Waiting for network",
        });
      }
      return;
    }
    if (was) return;
    for (const e of [...this.entries.values()]) {
      if (!e.session && !e.timer) void this.attempt(e);
    }
  }

  setLowPower(on: boolean) {
    this.lowPower = on;
  }
}
