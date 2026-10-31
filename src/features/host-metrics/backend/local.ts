import {
  DF_BYTES_COMMAND,
  DF_HUMAN_COMMAND,
  SYSTEM_INFO_COMMAND,
  buildFilesystemList,
  filterExcludedFilesystems,
  liveCmd,
  parseDfLines,
  parseKeys,
  parseLive,
  selectPrimaryFilesystem,
  type DiskFilesystem,
  type LivePrev,
  type LiveSample,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { ExecRunner } from "@/core/exec";
import type { MetricPoint } from "@/core/data/types";
import type { ServerMetrics } from "@/types";
import { showcaseMetrics } from "@/showcase/backends";
import { SHOWCASE } from "@/showcase/enabled";

const DF = "@@TERMIX_DF@@";
const DFH = "@@TERMIX_DFH@@";
const SYS = "@@TERMIX_SYS@@";

/** /proc, df and, once, the system info, in one exec. */
export function sampleScript(pageBytes?: number, withSystem = false): string {
  return [
    liveCmd(pageBytes),
    `echo "${DF}"`,
    `${DF_BYTES_COMMAND} 2>/dev/null`,
    `echo "${DFH}"`,
    `${DF_HUMAN_COMMAND} 2>/dev/null`,
    ...(withSystem ? [`echo "${SYS}"`, SYSTEM_INFO_COMMAND] : []),
    "exit 0",
    "",
  ].join("\n");
}

export interface SystemInfo {
  hostname: string | null;
  os: string | null;
  kernel: string | null;
}

/** Splits the sample output into its parts. */
export function splitSample(output: string) {
  const [live = "", rest = ""] = output.split(`${DF}\n`);
  const [bytes = "", rest2 = ""] = rest.split(`${DFH}\n`);
  const [human = "", sys] = rest2.split(`${SYS}\n`);
  return { live, bytes, human, sys };
}

export function formatBytes(value: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = Math.max(0, value);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d ? `${d}d` : "", h ? `${h}h` : "", `${m}m`]
    .filter(Boolean)
    .join(" ");
}

const round = (n: number | null, digits = 1) =>
  n === null || !Number.isFinite(n) ? null : Number(n.toFixed(digits));

/** Maps a live sample onto the shape the metric widgets draw. */
export function toServerMetrics(
  sample: LiveSample,
  disk: DiskFilesystem | null,
  system: SystemInfo | null,
  at = Date.now(),
): ServerMetrics {
  const kibToGiB = (kb: number) => kb / (1024 * 1024);
  const memTotal = sample.memTotalKb;
  return {
    cpu: {
      percent: round(sample.cpu),
      cores: sample.cores.length || null,
      load: sample.load,
    },
    memory: {
      percent: memTotal ? round((sample.memUsedKb / memTotal) * 100) : null,
      usedGiB: round(kibToGiB(sample.memUsedKb), 2),
      totalGiB: round(kibToGiB(memTotal), 2),
    },
    disk: {
      percent: disk?.percent ?? null,
      usedHuman: disk?.usedHuman ?? null,
      totalHuman: disk?.totalHuman ?? null,
      availableHuman: disk?.availableHuman ?? null,
    },
    network: {
      interfaces: sample.net.map((n) => ({
        name: n.name,
        rx: n.rxBps === null ? null : `${formatBytes(n.rxBps)}/s`,
        tx: n.txBps === null ? null : `${formatBytes(n.txBps)}/s`,
      })),
    },
    uptime: sample.uptime
      ? { seconds: sample.uptime, formatted: formatUptime(sample.uptime) }
      : undefined,
    processes: {
      total: sample.count,
      running: sample.running,
      top: sample.procs.slice(0, 10).map((p) => ({
        pid: p.pid,
        cpu: p.cpu,
        mem: memTotal ? (p.memKb / memTotal) * 100 : 0,
        command: p.name,
      })),
    },
    system: system ?? undefined,
    lastChecked: new Date(at).toISOString(),
  };
}

/** The history row for a sample. */
export function toPoint(
  sample: LiveSample,
  m: ServerMetrics,
  at: number,
): MetricPoint {
  const sum = (key: "rxBps" | "txBps") =>
    sample.net.some((n) => n[key] !== null)
      ? sample.net.reduce((a, n) => a + (n[key] ?? 0), 0)
      : null;
  return {
    ts: at,
    cpu: m.cpu.percent,
    mem: m.memory.percent,
    disk: m.disk.percent,
    rx: sum("rxBps"),
    tx: sum("txBps"),
  };
}

export interface LocalMetricsSample {
  metrics: ServerMetrics;
  point: MetricPoint;
}

/**
 * Samples a Linux host over the phone's SSH. CPU and network rates need two
 * samples, so the first call takes a second one a moment later.
 */
export function createLocalMetrics(
  runner: ExecRunner,
  options: {
    excludedMounts?: string[];
    wait?: (ms: number) => Promise<void>;
  } = {},
) {
  if (SHOWCASE) return showcaseMetrics(runner.hostId);
  let prev: LivePrev | undefined;
  let system: SystemInfo | null = null;
  const wait =
    options.wait ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function once(signal?: AbortSignal) {
    const { stdout } = await runner.run(
      sampleScript(prev?.pageBytes, !system),
      {
        mode: "plain",
        signal,
        timeoutMs: 15_000,
      },
    );
    const parts = splitSample(stdout);
    const at = Date.now();
    const parsed = parseLive(parts.live, prev, at);
    prev = parsed.next;
    if (parts.sys !== undefined) {
      const keys = parseKeys(parts.sys);
      system = {
        hostname: keys.hostname || null,
        os: keys.os || null,
        kernel: keys.kernel || null,
      };
    }
    const filesystems = filterExcludedFilesystems(
      buildFilesystemList(
        parseDfLines(parts.bytes),
        parseDfLines(parts.human),
        1024,
      ),
      options.excludedMounts,
    );
    const metrics = toServerMetrics(
      parsed.sample,
      selectPrimaryFilesystem(filesystems),
      system,
      at,
    );
    return { metrics, point: toPoint(parsed.sample, metrics, at) };
  }

  return {
    async sample(signal?: AbortSignal): Promise<LocalMetricsSample> {
      if (!prev) {
        await once(signal);
        await wait(1000);
      }
      return once(signal);
    },
  };
}
