import { ExecPool } from "@/core/exec/pool";
import { fakeHostSession, fakeSsh } from "../../helpers/exec";

function opener() {
  const made: ReturnType<typeof fakeHostSession>[] = [];
  const fakes: ReturnType<typeof fakeSsh>[] = [];
  const open = jest.fn(async () => {
    const fake = fakeSsh();
    fakes.push(fake);
    const s = fakeHostSession(fake);
    made.push(s);
    return s.session;
  });
  return { open, made, fakes };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test("leases on one host share one connection", async () => {
  const pool = new ExecPool(1000);
  const o = opener();
  const a = pool.acquire("acc:1", o.open);
  const b = pool.acquire("acc:1", o.open);
  expect(await a.session()).toBe(await b.session());
  expect(o.open).toHaveBeenCalledTimes(1);
  pool.acquire("acc:2", o.open).session();
  expect(o.open).toHaveBeenCalledTimes(2);
});

test("closes a while after the last lease lets go", async () => {
  jest.useFakeTimers();
  try {
    const pool = new ExecPool(1000);
    const o = opener();
    const a = pool.acquire("k", o.open);
    const b = pool.acquire("k", o.open);
    await a.session();
    a.release();
    a.release();
    jest.advanceTimersByTime(5000);
    expect(o.made[0].close).not.toHaveBeenCalled();
    b.release();
    jest.advanceTimersByTime(999);
    expect(o.made[0].close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(o.made[0].close).toHaveBeenCalled();
    expect(pool.size()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("a new lease in time keeps the connection", async () => {
  jest.useFakeTimers();
  try {
    const pool = new ExecPool(1000);
    const o = opener();
    const a = pool.acquire("k", o.open);
    await a.session();
    a.release();
    jest.advanceTimersByTime(500);
    const b = pool.acquire("k", o.open);
    jest.advanceTimersByTime(5000);
    await b.session();
    expect(o.open).toHaveBeenCalledTimes(1);
    expect(o.made[0].close).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test("a dropped or invalid connection is opened again", async () => {
  const pool = new ExecPool(1000);
  const o = opener();
  const lease = pool.acquire("k", o.open);
  await lease.session();
  await tick();
  o.fakes[0].drop();
  await lease.session();
  expect(o.open).toHaveBeenCalledTimes(2);
  const stale = lease.session();
  lease.invalidate(stale);
  await lease.session();
  expect(o.open).toHaveBeenCalledTimes(3);
  // Invalidating an old one does nothing to the current one.
  lease.invalidate(stale);
  await lease.session();
  expect(o.open).toHaveBeenCalledTimes(3);
});

test("a failed login is not kept", async () => {
  const pool = new ExecPool(1000);
  const open = jest
    .fn()
    .mockRejectedValueOnce(new Error("auth failed"))
    .mockResolvedValue(fakeHostSession(fakeSsh()).session);
  const lease = pool.acquire("k", open);
  await expect(lease.session()).rejects.toThrow("auth failed");
  await tick();
  await lease.session();
  expect(open).toHaveBeenCalledTimes(2);
});

test("closeAll ends every connection, leases reopen later", async () => {
  const pool = new ExecPool(1000);
  const o = opener();
  const a = pool.acquire("a", o.open);
  const b = pool.acquire("b", o.open);
  await a.session();
  await b.session();
  pool.closeAll();
  await tick();
  expect(o.made.every((m) => m.close.mock.calls.length === 1)).toBe(true);
  await a.session();
  expect(o.open).toHaveBeenCalledTimes(3);
});
