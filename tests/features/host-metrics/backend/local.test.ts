import type { ExecRunner } from "@/core/exec";
import {
  createLocalMetrics,
  formatBytes,
  formatUptime,
  sampleScript,
  splitSample,
} from "@/features/host-metrics/backend/local";
import { bucket, summary } from "@/features/host-metrics/HistoryCard";
import { metricsAllowed } from "@/features/host-metrics/register";
import { parseServerTime } from "@/core/api/modules/metrics";

/** What liveCmd prints, with ticks that grow by `step` each call. */
function live(step: number) {
  const busy = 100 * step;
  const idle = 300 * step;
  return [
    `cpu  ${busy} 0 0 ${idle} 0 0 0 0\ncpu0 ${busy} 0 0 ${idle} 0 0 0 0`,
    "MemTotal:       8000000 kB\nMemFree:        1000000 kB\nMemAvailable:   6000000 kB\nBuffers: 0 kB\nCached: 0 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB",
    `0.50 0.40 0.30 1/100 1\n${1000 + step} 2000`,
    `Inter-|\n eth0: ${1000 * step} 0 0 0 0 0 0 0 ${500 * step} 0\n lo: 1 0 0 0 0 0 0 0 1 0`,
    "4096",
    `1\t${10 * step}\t100\t5\tR\t0\tnginx\n`,
  ].join("\n@@\n");
}

const DF =
  "/dev/sda1 ext4 100000 40000 60000 40% /\ntmpfs tmpfs 100 0 100 0% /run";
const DFH = "/dev/sda1 ext4 98M 40M 60M 40% /";

function runner() {
  let call = 0;
  const scripts: string[] = [];
  const r = {
    run: jest.fn(async (script: string) => {
      scripts.push(script);
      call++;
      const sys = script.includes("TERMIX_SYS")
        ? "@@TERMIX_SYS@@\nhostname=web\nos=Debian 13\nkernel=6.12\n"
        : "";
      return {
        stdout: `${live(call)}\n@@TERMIX_DF@@\n${DF}\n@@TERMIX_DFH@@\n${DFH}\n${sys}`,
        stderr: "",
        code: 0,
        truncated: false,
      };
    }),
  } as unknown as ExecRunner;
  return { r, scripts };
}

test("the script asks for system info only when told to", () => {
  expect(sampleScript(undefined, true)).toContain("TERMIX_SYS");
  expect(sampleScript(4096)).not.toContain("TERMIX_SYS");
  expect(sampleScript(4096)).toContain("awk -v pg=4096");
  expect(splitSample("a\n@@TERMIX_DF@@\nb\n@@TERMIX_DFH@@\nc\n")).toEqual({
    live: "a\n",
    bytes: "b\n",
    human: "c\n",
    sys: undefined,
  });
});

test("the first sample waits for a second one so rates exist", async () => {
  const { r, scripts } = runner();
  const wait = jest.fn(async () => {});
  const source = createLocalMetrics(r, { wait });
  const { metrics, point } = await source.sample();
  expect(scripts).toHaveLength(2);
  expect(wait).toHaveBeenCalledWith(1000);
  expect(scripts[0]).toContain("TERMIX_SYS");
  expect(scripts[1]).not.toContain("TERMIX_SYS");
  expect(metrics.cpu.percent).toBe(25);
  expect(metrics.memory).toEqual({
    percent: 25,
    usedGiB: 1.91,
    totalGiB: 7.63,
  });
  expect(metrics.disk).toMatchObject({ percent: 40, usedHuman: "40M" });
  expect(metrics.system).toEqual({
    hostname: "web",
    os: "Debian 13",
    kernel: "6.12",
  });
  expect(metrics.network?.interfaces).toEqual([
    { name: "eth0", rx: "1000 B/s", tx: "500 B/s" },
  ]);
  expect(metrics.processes?.top[0]).toMatchObject({ command: "nginx" });
  expect(point).toMatchObject({
    cpu: 25,
    mem: 25,
    disk: 40,
    rx: 1000,
    tx: 500,
  });
  await source.sample();
  expect(scripts).toHaveLength(3);
});

test("formats bytes and uptime plainly", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
  expect(formatUptime(90061)).toBe("1d 1h 1m");
  expect(formatUptime(120)).toBe("2m");
});

test("history buckets average into even slices", () => {
  const points = Array.from({ length: 120 }, (_, i) => ({
    ts: i * 60_000,
    cpu: i % 2 ? 100 : 0,
    mem: null,
    disk: 5,
    rx: null,
    tx: null,
  }));
  const cpu = bucket(points, "cpu", 60);
  expect(cpu).toHaveLength(60);
  expect(cpu.every((v) => v === 50)).toBe(true);
  expect(bucket(points, "mem")).toEqual([]);
  expect(bucket(points.slice(0, 3), "disk")).toEqual([5, 5, 5]);
  expect(summary([10, 30])).toBe("avg 20% | max 30%");
  expect(summary([])).toBe("No data yet");
});

test("metrics stay on unless the host turned them off", () => {
  const h = (over: object) => ({ enableSsh: true, ...over }) as any;
  expect(metricsAllowed(h({ pluginSettings: {} }))).toBe(true);
  expect(
    metricsAllowed(
      h({ pluginSettings: { "host-metrics": { metricsEnabled: false } } }),
    ),
  ).toBe(false);
  expect(
    metricsAllowed(
      h({ statsConfig: JSON.stringify({ metricsEnabled: false }) }),
    ),
  ).toBe(false);
});

test("server times read as UTC", () => {
  expect(parseServerTime("2026-10-24 12:00:00")).toBe(
    Date.UTC(2026, 9, 24, 12),
  );
  expect(parseServerTime("2026-10-24T12:00:00+02:00")).toBe(
    Date.UTC(2026, 9, 24, 10),
  );
  expect(parseServerTime(5)).toBe(5);
  expect(parseServerTime(null)).toBeNaN();
});
