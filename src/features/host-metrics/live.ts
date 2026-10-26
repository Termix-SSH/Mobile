import type { ServerMetrics } from "@/types";

/** One 1s /proc sample from the server's live route (plugin 1.1+). */
export interface LiveSample {
  minIntervalS?: number;
  cpu: number | null;
  cpuMix?: { user: number; system: number; iowait: number; steal: number };
  cores: (number | null)[];
  coreIds: string[];
  memTotalKb: number;
  memCachedKb: number;
  memFreeKb: number;
  memUsedKb: number;
  load: [number, number, number];
  net: { name: string; rxBps: number | null; txBps: number | null }[];
  count: number;
  running: number;
  procs: {
    pid: number;
    name: string;
    cpu: number;
    memKb: number;
    state?: string;
    ppid?: number;
  }[];
}

const gib = (kb: number) => Math.round((kb / 1024 / 1024) * 100) / 100;

/** Lays the live sample over the slow full sample, like the web cards. */
export function mergeLive(
  m: ServerMetrics | null,
  l: LiveSample | null,
): ServerMetrics | null {
  if (!m || !l) return m;
  const memTotal = l.memTotalKb;
  return {
    ...m,
    cpu: {
      ...m.cpu,
      percent: l.cpu == null ? m.cpu.percent : Math.round(l.cpu),
      load: l.load,
      perCore: l.cores,
      coreIds: l.coreIds,
      mix: l.cpuMix,
    },
    memory: memTotal
      ? {
          percent: Math.round((l.memUsedKb / memTotal) * 100),
          usedGiB: gib(l.memUsedKb),
          totalGiB: gib(memTotal),
          cachedGiB: gib(l.memCachedKb),
          freeGiB: gib(l.memFreeKb),
        }
      : m.memory,
    network: m.network && {
      ...m.network,
      interfaces: m.network.interfaces.map((i) => {
        const n = l.net.find((x) => x.name === i.name);
        return n ? { ...i, rxRateBps: n.rxBps, txRateBps: n.txBps } : i;
      }),
    },
    processes: {
      ...m.processes,
      total: l.count,
      running: l.running,
      top: l.procs.map((p) => ({
        pid: String(p.pid),
        state: p.state,
        ppid: p.ppid == null ? undefined : String(p.ppid),
        cpu: p.cpu,
        mem: memTotal ? (p.memKb / memTotal) * 100 : 0,
        command: p.name,
      })),
    },
  };
}

export const LIVE_POLL_MS = 2000;
/** A host that keeps failing (not Linux) or has live off is asked this rarely. */
export const LIVE_RETRY_MS = 30_000;
export const LIVE_MAX_ERRORS = 3;
