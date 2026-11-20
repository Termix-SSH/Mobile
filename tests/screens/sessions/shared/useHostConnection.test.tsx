import { act, renderHook } from "@testing-library/react-native";
import type { OriginInputs } from "@/core/transport/origin";
import type {
  ShellChannel,
  ShellOptions,
  Transport,
} from "@/core/transport/types";

function fakeTransport(kind: Transport["kind"]) {
  const shells: ShellOptions[] = [];
  const transport: Transport = {
    kind,
    provides:
      kind === "local" ? ["shell", "tcp"] : ["shell", "server", "guacd"],
    available: true,
    openShell: (options) => {
      shells.push(options);
      return {
        connect: jest.fn(async () => {}),
        sendInput: jest.fn(),
        sendResize: jest.fn(),
        destroy: jest.fn(),
        notifyBackgrounded: jest.fn(),
        notifyForegrounded: jest.fn(),
      } as unknown as ShellChannel;
    },
  };
  return { transport, last: () => shells[shells.length - 1] };
}

const local = fakeTransport("local");
const relay = fakeTransport("relay");
let mockInputs: OriginInputs;
let mockPlanned: "auto" | "device" | "server";
const mockSave = jest.fn(async () => {});

jest.mock("@/core/accounts/session", () => ({
  useSessionAccountId: () => "acc",
}));
jest.mock("@/core/sessions/lifecycle", () => ({
  sessionLifecycle: { register: () => () => {} },
}));
jest.mock("@/core/features", () => {
  const { planConnection } = jest.requireActual("@/core/transport/origin");
  return {
    checkOpen: async () => {
      const plan = planConnection(mockPlanned, mockInputs);
      return { attempts: plan.attempts, blocked: plan.blocked, plan };
    },
    // The real one keeps only ways where the phone dials the host.
    deviceDialOnly: (check: any) => ({
      ...check,
      attempts: check.attempts.filter((t: Transport) =>
        t.provides.includes("tcp"),
      ),
    }),
  };
});
jest.mock("@/core/transport", () => ({
  ...jest.requireActual("@/core/transport/connection"),
  ...jest.requireActual("@/core/transport/origin"),
  originInputs: () => mockInputs,
  saveOrigin: (...args: unknown[]) => mockSave(...(args as [])),
}));

// eslint-disable-next-line import/first
import { useHostConnection } from "@/screens/sessions/shared/useHostConnection";

const host = { id: 7, name: "Switch", ip: "10.0.0.5" } as any;

async function failFromPhone(planned: typeof mockPlanned, withServer = true) {
  mockPlanned = planned;
  mockInputs = {
    accountKind: withServer ? "server" : "local",
    local: local.transport,
    relay: withServer ? relay.transport : null,
    isSsh: true,
  };
  const onUseServer = jest.fn();
  const hook = await renderHook(() =>
    useHostConnection(host, host, {
      type: "telnet",
      isSsh: false,
      protocol: "telnet",
      onData: () => {},
      onUseServer,
    }),
  );
  await act(async () => {
    await hook.result.current.conn.connect(80, 24);
  });
  await act(async () => {
    local.last().onConnectionFailed("Switch: timed out", {
      stage: "network",
      message: "timed out",
      hint: "h",
    });
  });
  return { hook, onUseServer };
}

beforeEach(() => mockSave.mockClear());

test("automatic moves Telnet to the server when the phone can't reach the host", async () => {
  const { hook, onUseServer } = await failFromPhone("auto");
  expect(hook.result.current.state.status).toBe("failed");
  expect(onUseServer).toHaveBeenCalledTimes(1);
  expect(mockSave).not.toHaveBeenCalled();
});

test("this phone offers the server and moves there when picked", async () => {
  const { hook, onUseServer } = await failFromPhone("device");
  expect(onUseServer).not.toHaveBeenCalled();
  expect(hook.result.current.switchTo).toBe("server");
  await act(async () => hook.result.current.switchOrigin("server"));
  expect(mockSave).toHaveBeenCalledWith("acc", 7, "server");
  expect(onUseServer).toHaveBeenCalledTimes(1);
});

test("no server means no move and no offer", async () => {
  const { hook, onUseServer } = await failFromPhone("auto", false);
  expect(onUseServer).not.toHaveBeenCalled();
  expect(hook.result.current.switchTo).toBeUndefined();
});
