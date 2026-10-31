import {
  IOS_STOPPED,
  LocalTunnelRunner,
  openForwards,
  type TunnelJob,
} from "@/core/tunnels/runner";
import type { TunnelConnection } from "@/types";

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeSession() {
  let drop: (info: { kind: string; reason?: string }) => void = () => {};
  const forward = () => ({
    id: "f",
    port: 1,
    close: jest.fn(async () => {}),
  });
  const ssh = {
    forwardLocal: jest.fn(async () => forward()),
    forwardRemote: jest.fn(async () => forward()),
    forwardDynamic: jest.fn(async () => forward()),
    ping: jest.fn(async () => {}),
    onDisconnect: (l: typeof drop) => {
      drop = l;
      return () => {};
    },
  };
  return {
    session: { ssh, close: jest.fn(async () => {}) } as any,
    ssh,
    drop: (reason?: string) => drop({ kind: "network", reason }),
  };
}

const tunnel = (patch: Partial<TunnelConnection> = {}): TunnelConnection => ({
  mode: "local",
  sourcePort: 8080,
  endpointPort: 80,
  maxRetries: 2,
  retryInterval: 1,
  autoStart: false,
  ...patch,
});

function job(open: TunnelJob["open"], t = tunnel()): TunnelJob {
  return { key: "k", hostId: 1, hostName: "box", tunnel: t, open };
}

test("picks the forward for each mode", async () => {
  const s = fakeSession();
  await openForwards(s.session, tunnel({ targetHost: "db" }));
  expect(s.ssh.forwardLocal).toHaveBeenCalledWith(8080, "db", 80, "127.0.0.1");
  await openForwards(s.session, tunnel({ mode: "remote" }));
  expect(s.ssh.forwardRemote).toHaveBeenCalledWith(
    80,
    "127.0.0.1",
    8080,
    "127.0.0.1",
  );
  await openForwards(
    s.session,
    tunnel({ mode: "dynamic", bindHost: "0.0.0.0" }),
  );
  expect(s.ssh.forwardDynamic).toHaveBeenCalledWith(8080, "0.0.0.0");
});

test("connects and stops", async () => {
  const s = fakeSession();
  const r = new LocalTunnelRunner();
  r.start(job(async () => s.session));
  await flush();
  expect(r.getSnapshot().k.status).toBe("connected");
  expect(r.active()).toHaveLength(1);
  r.stop("k");
  expect(r.getSnapshot().k.status).toBe("disconnected");
  expect(r.active()).toHaveLength(0);
  expect(s.session.close).toHaveBeenCalled();
});

test("retries a failed open, then gives up", async () => {
  jest.useFakeTimers();
  const open = jest.fn(async () => {
    throw new Error("refused");
  });
  const r = new LocalTunnelRunner();
  r.start(job(open, tunnel({ maxRetries: 1 })));
  await jest.advanceTimersByTimeAsync(0);
  expect(r.getSnapshot().k.status).toBe("waiting");
  await jest.advanceTimersByTimeAsync(20000);
  expect(open).toHaveBeenCalledTimes(2);
  expect(r.getSnapshot().k).toMatchObject({
    status: "failed",
    reason: "refused",
  });
  jest.useRealTimers();
});

test("a drop on android retries", async () => {
  jest.useFakeTimers();
  const sessions = [fakeSession(), fakeSession()];
  const open = jest.fn(async () => sessions.shift()!.session);
  const first = sessions[0];
  const r = new LocalTunnelRunner({ platform: "android" });
  r.start(job(open));
  await jest.advanceTimersByTimeAsync(0);
  first.drop("lost");
  expect(r.getSnapshot().k.status).toBe("waiting");
  await jest.advanceTimersByTimeAsync(20000);
  expect(r.getSnapshot().k.status).toBe("connected");
  jest.useRealTimers();
});

test("iOS stops tunnels that died in the background", async () => {
  const s = fakeSession();
  const r = new LocalTunnelRunner({ platform: "ios" });
  r.start(job(async () => s.session));
  await flush();
  r.notifyBackgrounded();
  s.ssh.ping.mockRejectedValueOnce(new Error("dead"));
  r.notifyForegrounded();
  await flush();
  expect(r.getSnapshot().k).toMatchObject({
    status: "failed",
    reason: IOS_STOPPED,
  });
  expect(r.active()).toHaveLength(0);
});

test("waits for the network and starts again when it is back", async () => {
  const sessions = [fakeSession(), fakeSession()];
  const open = jest.fn(async () => sessions.shift()!.session);
  const r = new LocalTunnelRunner();
  r.notifyNetworkChanged({ connected: false });
  r.start(job(open));
  await flush();
  expect(r.getSnapshot().k.status).toBe("waiting");
  expect(open).not.toHaveBeenCalled();
  r.notifyNetworkChanged({ connected: true });
  await flush();
  expect(r.getSnapshot().k.status).toBe("connected");
});

test("stopHost stops only that host", async () => {
  const r = new LocalTunnelRunner();
  r.start(job(async () => fakeSession().session));
  r.start({ ...job(async () => fakeSession().session), key: "o", hostId: 2 });
  await flush();
  r.stopHost(1);
  expect(r.active().map((a) => a.key)).toEqual(["o"]);
});
