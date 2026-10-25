import {
  intervalMs,
  LocalStatusMonitor,
  MAX_PARALLEL,
  probeTarget,
} from "@/core/status/monitor";

const host = (id: number, extra: object = {}) =>
  ({ id, ip: `10.0.0.${id}`, port: 22, ...extra }) as any;

test("only hosts the phone can dial are checked", () => {
  expect(probeTarget(host(1))).toEqual({ host: "10.0.0.1", port: 22 });
  expect(probeTarget(host(1, { sshPort: 2222 }))).toEqual({
    host: "10.0.0.1",
    port: 2222,
  });
  expect(probeTarget(host(1, { statusCheckEnabled: false }))).toBeNull();
  expect(probeTarget(host(1, { jumpHosts: [{ hostId: 2 }] }))).toBeNull();
  expect(probeTarget(host(1, { ip: " " }))).toBeNull();
  expect(probeTarget(host(1, { port: 70000 }))).toBeNull();
});

test("the interval defaults to 30s and never goes under 5s", () => {
  expect(intervalMs(host(1))).toBe(30000);
  expect(intervalMs(host(1, { statusCheckInterval: 2 }))).toBe(5000);
  expect(intervalMs(host(1, { statusCheckInterval: 60 }))).toBe(60000);
  expect(intervalMs(host(1, { statusCheckInterval: null }))).toBe(30000);
});

test("online at once, offline only after two misses", async () => {
  let now = 0;
  const results = [true, false, false];
  const probe = jest.fn(async () => results.shift()!);
  const m = new LocalStatusMonitor(probe, () => now);
  const changed = jest.fn();
  m.subscribe(changed);
  m.setHosts([host(1)]);

  await m.tick();
  expect(m.snapshot()).toEqual({ 1: "online" });

  // not due yet
  await m.tick();
  expect(probe).toHaveBeenCalledTimes(1);

  now += 30000;
  await m.tick();
  expect(m.snapshot()).toEqual({ 1: "online" });
  now += 30000;
  await m.tick();
  expect(m.snapshot()).toEqual({ 1: "offline" });
  expect(changed).toHaveBeenCalledTimes(2);
});

test("a first miss is rechecked soon and says nothing yet", async () => {
  let now = 0;
  const probe = jest.fn().mockResolvedValue(false);
  const m = new LocalStatusMonitor(probe, () => now);
  m.setHosts([host(1)]);
  await m.tick();
  expect(m.snapshot()).toEqual({});
  now += 2000;
  await m.tick();
  expect(m.snapshot()).toEqual({ 1: "offline" });
});

test("a probe that throws counts as a miss", async () => {
  let now = 0;
  const m = new LocalStatusMonitor(
    async () => {
      throw new Error("boom");
    },
    () => now,
  );
  m.setHosts([host(1)]);
  await m.tick();
  now += 2000;
  await m.tick();
  expect(m.snapshot()).toEqual({ 1: "offline" });
});

test("removed and unprobeable hosts drop out, others keep their reading", async () => {
  const m = new LocalStatusMonitor(
    async () => true,
    () => 0,
  );
  m.setHosts([host(1), host(2)]);
  await m.tick();
  expect(m.snapshot()).toEqual({ 1: "online", 2: "online" });
  m.setHosts([host(1), host(2, { statusCheckEnabled: false })]);
  expect(m.snapshot()).toEqual({ 1: "online" });
});

test("no more than the parallel limit run at once", async () => {
  let active = 0;
  let peak = 0;
  const probe = async () => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    await Promise.resolve();
    active--;
    return true;
  };
  const m = new LocalStatusMonitor(probe, () => 0);
  m.setHosts(Array.from({ length: 30 }, (_, i) => host(i + 1)));
  await m.tick();
  expect(peak).toBe(MAX_PARALLEL);
  expect(Object.keys(m.snapshot())).toHaveLength(30);
});

test("refresh makes every host due again", async () => {
  const probe = jest.fn(async () => true);
  const m = new LocalStatusMonitor(probe, () => 0);
  m.setHosts([host(1)]);
  await m.tick();
  await m.tick();
  expect(probe).toHaveBeenCalledTimes(1);
  m.refresh();
  await m.tick();
  expect(probe).toHaveBeenCalledTimes(2);
});

test("many changes in one tick send one update", async () => {
  const probe = jest.fn(async () => true);
  const m = new LocalStatusMonitor(probe, () => 0);
  const changed = jest.fn();
  m.subscribe(changed);
  m.setHosts(Array.from({ length: 50 }, (_, i) => host(i + 1)));
  await m.tick();
  expect(Object.keys(m.snapshot())).toHaveLength(50);
  // One right away, then the rest together when the tick ends.
  expect(changed).toHaveBeenCalledTimes(2);
});
