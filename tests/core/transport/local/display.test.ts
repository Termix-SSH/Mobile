import type { HostConnectProfile } from "@/core/data/types";
import { createLocalTransport } from "@/core/transport/local";
import { SshError } from "@/modules/termix-ssh";

const mockConnect = jest.fn();
const mockOpenDisplay = jest.fn();
jest.mock("@/modules/termix-ssh", () => ({
  ...jest.requireActual("@/modules/termix-ssh"),
  connect: (...args: unknown[]) => mockConnect(...args),
  openDisplay: (...args: unknown[]) => mockOpenDisplay(...args),
}));

function profile(id: number, over: Record<string, unknown> = {}) {
  return {
    host: {
      id,
      name: "PC",
      ip: `host${id}.lan`,
      port: 22,
      username: "u",
      authType: "password",
      password: "pw",
      jumpHosts: [],
    },
    credential: null,
    sshOptions: {},
    socks5: { use: false, chain: [] },
    portKnock: [],
    hostKey: null,
    ...over,
  } as unknown as HostConnectProfile;
}

const target = {
  protocol: "rdp" as const,
  port: 3389,
  width: 1280,
  height: 720,
};

function transport(profiles: Record<number, HostConnectProfile>) {
  const repo = {
    profile: jest.fn(async (id: number) => profiles[id] ?? null),
    saveHostKey: jest.fn(async () => {}),
    touchHostKey: jest.fn(async () => {}),
  };
  return createLocalTransport(true, () => repo);
}

const hostConfig = (jumpHosts: { hostId: number }[] = []) => ({
  id: 7,
  name: "PC",
  ip: "pc.lan",
  port: 22,
  username: "u",
  authType: "password" as const,
  jumpHosts,
});

beforeEach(() => {
  mockConnect.mockReset();
  mockOpenDisplay.mockReset();
});

test("dials the host's address through its proxies", async () => {
  const display = { frameId: "f", close: jest.fn() };
  mockOpenDisplay.mockResolvedValue(display);
  const t = transport({
    7: profile(7, {
      socks5: { use: true, host: "proxy.lan", port: 1080, chain: [] },
    }),
  });
  const opened = await t.openDisplay!(hostConfig(), target, {});
  expect(mockOpenDisplay).toHaveBeenCalledWith(
    expect.objectContaining({
      ...target,
      host: "pc.lan",
      proxies: [expect.objectContaining({ host: "proxy.lan", port: 1080 })],
    }),
    expect.anything(),
    undefined,
  );
  opened.close();
  expect(display.close).toHaveBeenCalled();
});

test("goes through jump hosts and logs out of them when the session ends", async () => {
  const hop = { disconnect: jest.fn(async () => {}), isClosed: false };
  mockConnect.mockResolvedValue(hop);
  let handlers: { onClosed?: (r: string | null) => void } = {};
  mockOpenDisplay.mockImplementation(async (_c, h) => {
    handlers = h;
    return { frameId: "f", close: jest.fn() };
  });
  const onClosed = jest.fn();
  const t = transport({ 7: profile(7), 3: profile(3) });
  await t.openDisplay!(hostConfig([{ hostId: 3 }]), target, { onClosed });
  expect(mockOpenDisplay.mock.calls[0][2]).toBe(hop);
  handlers.onClosed?.("bye");
  expect(onClosed).toHaveBeenCalledWith("bye");
  expect(hop.disconnect).toHaveBeenCalled();
});

test("a refused login closes the jump hosts and keeps its kind", async () => {
  const hop = { disconnect: jest.fn(async () => {}), isClosed: false };
  mockConnect.mockResolvedValue(hop);
  mockOpenDisplay.mockRejectedValue(new SshError("auth", "refused"));
  const t = transport({ 7: profile(7), 3: profile(3) });
  await expect(
    t.openDisplay!(hostConfig([{ hostId: 3 }]), target, {}),
  ).rejects.toMatchObject({ kind: "auth" });
  expect(hop.disconnect).toHaveBeenCalled();
});

test("refuses without the engine", async () => {
  const t = createLocalTransport(false, () => undefined);
  await expect(t.openDisplay!(hostConfig(), target, {})).rejects.toThrow(
    /no SSH engine/,
  );
});
