import {
  HostConnection,
  type HostConnectionOptions,
} from "@/core/transport/connection";
import type {
  ShellChannel,
  ShellOptions,
  Transport,
} from "@/core/transport/types";

const mockRecord = jest.fn(async () => {});
jest.mock("@/core/analytics/usage", () => ({
  recordConnect: (...args: unknown[]) => mockRecord(...(args as [])),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

/** A transport whose shells the test drives by hand. */
function fakeTransport(kind: Transport["kind"]) {
  const shells: {
    options: ShellOptions;
    channel: jest.Mocked<ShellChannel>;
  }[] = [];
  const transport: Transport = {
    kind,
    provides: ["shell"],
    available: true,
    openShell: (options) => {
      const channel = {
        connect: jest.fn(async () => {}),
        sendInput: jest.fn(),
        sendResize: jest.fn(),
        sendTotpResponse: jest.fn(),
        sendHostKeyResponse: jest.fn(),
        sendPassphraseResponse: jest.fn(),
        sendReconnectWithCredentials: jest.fn(),
        sendWarpgateContinue: jest.fn(),
        notifyBackgrounded: jest.fn(),
        notifyForegrounded: jest.fn(),
        destroy: jest.fn(),
      } as unknown as jest.Mocked<ShellChannel>;
      shells.push({ options, channel });
      return channel;
    },
  };
  return { transport, shells, last: () => shells[shells.length - 1] };
}

function setup(
  attempts: Transport[],
  over: Partial<HostConnectionOptions> = {},
) {
  const opts = {
    host: { id: 1, name: "Box", ip: "box.lan" } as any,
    plan: jest.fn(async () => ({ attempts })),
    onData: jest.fn(),
    onConnected: jest.fn(),
    onPostConnectionSetup: jest.fn(),
    onDisconnected: jest.fn(),
    onSessionIdChange: jest.fn(),
    onOriginResolved: jest.fn(),
    ...over,
  };
  const conn = new HostConnection(opts);
  return { conn, opts };
}

beforeEach(() => mockRecord.mockClear());

describe("connection usage counts", () => {
  test("counts a connect that worked, by transport only", async () => {
    const local = fakeTransport("local");
    const { conn } = setup([local.transport]);
    await conn.connect(80, 24);
    local.last().options.onStateChange("connected");
    expect(mockRecord).toHaveBeenCalledWith("local", "ok");
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  test("counts a failure by its stage, not its message", async () => {
    const relay = fakeTransport("relay");
    const { conn } = setup([relay.transport]);
    await conn.connect(80, 24);
    relay.last().options.onConnectionFailed("root@prod-db-01: refused", {
      stage: "auth",
      message: "root@prod-db-01: refused",
      hint: "h",
    });
    expect(mockRecord).toHaveBeenCalledWith("relay", "auth");
    expect(JSON.stringify(mockRecord.mock.calls)).not.toContain("prod-db");
  });
});
