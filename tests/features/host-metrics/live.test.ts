import { mergeLive, type LiveSample } from "@/features/host-metrics/live";
import type { ServerMetrics } from "@/types";

const slow: ServerMetrics = {
  cpu: { percent: 10, cores: 2, load: [0, 0, 0] },
  memory: { percent: 50, usedGiB: 1, totalGiB: 2 },
  disk: { percent: 30, usedHuman: "3G", totalHuman: "10G" },
  network: { interfaces: [{ name: "eth0", state: "UP", rx: "1G" }] },
  processes: { total: 10, running: 1, top: [] },
  lastChecked: "2026-10-25T00:00:00Z",
};

const live: LiveSample = {
  cpu: 42.4,
  cpuMix: { user: 30, system: 10, iowait: 2, steal: 0 },
  cores: [40, 45],
  coreIds: ["0", "1"],
  memTotalKb: 4 * 1024 * 1024,
  memCachedKb: 1024 * 1024,
  memFreeKb: 1024 * 1024,
  memUsedKb: 2 * 1024 * 1024,
  load: [1, 2, 3],
  net: [{ name: "eth0", rxBps: 2000, txBps: 500 }],
  count: 120,
  running: 3,
  procs: [{ pid: 7, name: "node", cpu: 12.5, memKb: 1024 * 1024 }],
};

test("no live sample keeps the slow one", () => {
  expect(mergeLive(slow, null)).toBe(slow);
  expect(mergeLive(null, live)).toBeNull();
});

test("the live sample fills cores, memory split, rates and processes", () => {
  const m = mergeLive(slow, live)!;
  expect(m.cpu.percent).toBe(42);
  expect(m.cpu.perCore).toEqual([40, 45]);
  expect(m.cpu.mix?.iowait).toBe(2);
  expect(m.memory).toEqual({
    percent: 50,
    usedGiB: 2,
    totalGiB: 4,
    cachedGiB: 1,
    freeGiB: 1,
  });
  expect(m.network?.interfaces[0]).toMatchObject({
    rx: "1G",
    rxRateBps: 2000,
    txRateBps: 500,
  });
  expect(m.processes?.top[0]).toMatchObject({
    pid: "7",
    command: "node",
    cpu: 12.5,
    mem: 25,
  });
  // Disk only comes from the slow sample.
  expect(m.disk).toBe(slow.disk);
});
