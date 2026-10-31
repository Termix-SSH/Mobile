import type { HostConnectProfile } from "@/core/data/types";
import { createLocalTransport } from "@/core/transport/local";
import { LocalTelnetShell } from "@/core/transport/local/LocalTelnetShell";
import type { ShellOptions } from "@/core/transport/types";
import { SshError } from "@/modules/termix-ssh";

const mockConnect = jest.fn();
const mockTelnet = jest.fn();
jest.mock("@/modules/termix-ssh", () => ({
  ...jest.requireActual("@/modules/termix-ssh"),
  connect: (...args: unknown[]) => mockConnect(...args),
  connectTelnet: (...args: unknown[]) => mockTelnet(...args),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));
const enc = (s: string) => new TextEncoder().encode(s);

function fakeTelnet() {
  const t = {
    handlers: null as any,
    write: jest.fn(async () => {}),
    resize: jest.fn(async () => {}),
    close: jest.fn(async () => {}),
    release: jest.fn(),
  };
  mockTelnet.mockImplementation(async (_o: unknown, handlers: unknown) => {
    t.handlers = handlers;
    return t;
  });
  return t;
}

function profile(id: number, over: Record<string, unknown> = {}) {
  return {
    host: {
      id,
      name: "Router",
      ip: "router.lan",
      port: 22,
      username: "admin",
      authType: "password",
      password: "pw",
      jumpHosts: [],
      telnetPort: 2323,
      telnetUser: "admin",
      telnetPassword: "secret",
      ...over,
    },
    credential: null,
    sshOptions: {},
    socks5: { use: false, chain: [] },
    portKnock: [],
    hostKey: null,
  } as unknown as HostConnectProfile;
}

function setup(
  profiles: Record<number, HostConnectProfile> = { 7: profile(7) },
  jumpHosts: { hostId: number }[] = [],
) {
  const repo = {
    profile: jest.fn(async (id: number) => profiles[id] ?? null),
    saveHostKey: jest.fn(async () => {}),
    touchHostKey: jest.fn(async () => {}),
  };
  const events = {
    onStateChange: jest.fn(),
    onData: jest.fn(),
    onTotpRequired: jest.fn(),
    onAuthDialogNeeded: jest.fn(),
    onHostKeyVerificationRequired: jest.fn(),
    onPostConnectionSetup: jest.fn(),
    onDisconnected: jest.fn(),
    onDropped: jest.fn(),
    onConnectionFailed: jest.fn(),
  };
  const options: ShellOptions = {
    hostConfig: {
      id: 7,
      name: "Router",
      ip: "router.lan",
      port: 22,
      username: "admin",
      authType: "password",
      jumpHosts,
    },
    protocol: "telnet",
    pipeId: "pipe-1",
    ...events,
  };
  return { shell: new LocalTelnetShell(options, () => repo), events, repo };
}

beforeEach(() => {
  mockConnect.mockReset();
  mockTelnet.mockReset();
});

test("dials the telnet port with the saved login and streams text", async () => {
  const t = fakeTelnet();
  const { shell, events } = setup();
  await shell.connect(100, 30);
  expect(mockTelnet).toHaveBeenCalledWith(
    expect.objectContaining({
      dial: expect.objectContaining({ host: "router.lan", port: 2323 }),
      cols: 100,
      rows: 30,
      username: "admin",
      password: "secret",
      via: undefined,
      pipeId: "pipe-1",
    }),
    expect.anything(),
  );
  expect(events.onStateChange).toHaveBeenCalledWith(
    "connected",
    expect.objectContaining({ hostName: "Router" }),
  );
  expect(events.onPostConnectionSetup).toHaveBeenCalled();
  t.handlers.onData(enc("login: "));
  expect(events.onData).toHaveBeenCalledWith("login: ");
  shell.sendInput("ls\r");
  shell.sendResize(120, 40);
  expect(t.write).toHaveBeenCalledWith(enc("ls\r"));
  expect(t.resize).toHaveBeenCalledWith(120, 40);
  expect(await shell.probe()).toBe(true);
});

test("uses port 23 for a host with none saved", async () => {
  fakeTelnet();
  const { shell } = setup({ 7: profile(7, { telnetPort: undefined }) });
  await shell.connect(80, 24);
  expect(mockTelnet.mock.calls[0][0].dial.port).toBe(23);
});

test("goes through the host's jump hosts", async () => {
  fakeTelnet();
  const hop = { disconnect: jest.fn(async () => {}), isClosed: false };
  mockConnect.mockResolvedValue(hop);
  const { shell } = setup({ 7: profile(7), 3: profile(3) }, [{ hostId: 3 }]);
  await shell.connect(80, 24);
  expect(mockConnect).toHaveBeenCalledTimes(1);
  expect(mockTelnet.mock.calls[0][0].via).toBe(hop);
  shell.destroy();
  expect(hop.disconnect).toHaveBeenCalled();
});

test("a logout ends the tab and a cut connection is a drop", async () => {
  const t = fakeTelnet();
  const a = setup();
  await a.shell.connect(80, 24);
  t.handlers.onExit(0, null);
  expect(a.events.onDisconnected).toHaveBeenCalledWith("Router");
  expect(a.events.onDropped).not.toHaveBeenCalled();

  const t2 = fakeTelnet();
  const b = setup();
  await b.shell.connect(80, 24);
  t2.handlers.onExit(null, null);
  expect(b.events.onDropped).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "network" }),
  );
  expect(await b.shell.probe()).toBe(false);
});

test("a refused connection fails with what went wrong", async () => {
  mockTelnet.mockRejectedValue(new SshError("connect", "Connection refused"));
  const { shell, events } = setup();
  await shell.connect(80, 24);
  await flush();
  expect(events.onConnectionFailed).toHaveBeenCalledWith(
    "Router: Connection refused",
    expect.objectContaining({ stage: "network", origin: "local" }),
  );
  expect(events.onStateChange).not.toHaveBeenCalledWith(
    "connected",
    expect.anything(),
  );
});

test("the phone transport opens telnet shells for telnet tabs", () => {
  const repo = () => undefined;
  const t = createLocalTransport(true, () => ({}) as never);
  const base = setup().shell as unknown as { options: ShellOptions };
  expect(t.provides).toContain("tcp");
  expect(t.openShell({ ...base.options, protocol: "telnet" })).toBeInstanceOf(
    LocalTelnetShell,
  );
  expect(t.openShell({ ...base.options, protocol: "ssh" })).not.toBeInstanceOf(
    LocalTelnetShell,
  );
  expect(createLocalTransport(true, repo).available).toBe(false);
});
