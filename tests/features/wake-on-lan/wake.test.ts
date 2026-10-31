import { wakeOnLanFeature, wakeRoute } from "@/features/wake-on-lan/register";
import { isFeatureAvailable } from "@/core/features/registry";
import { originOf } from "@/core/transport";
import { wakeFromDevice } from "@/core/wol";
import { toast } from "@/utils/toast";

jest.mock("@/core/transport", () => ({ originOf: jest.fn() }));
jest.mock("@/core/wol", () => ({ wakeFromDevice: jest.fn() }));
jest.mock("@/core/sync", () => ({ serverHostId: jest.fn(async () => 42) }));
jest.mock("@/utils/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const host = { id: 1, name: "Nas", macAddress: "aa:bb:cc:dd:ee:ff" } as any;
const local = { account: { id: "local", kind: "local" } as any, client: null };
function server(supported = true) {
  const wakeHost = jest.fn().mockResolvedValue(undefined);
  return {
    wakeHost,
    ctx: {
      account: { id: "s", kind: "server" } as any,
      client: {
        accountId: "s",
        supports: () => supported,
        api: { wakeOnLan: { wakeHost } },
      } as any,
    },
  };
}
const action = wakeOnLanFeature.hostActions![0];
const run = (ctx: any) => action.run(host, { ...ctx, close: jest.fn() } as any);

beforeEach(() => jest.clearAllMocks());

test("it works on This device and hides on a server without the plugin", () => {
  expect(isFeatureAvailable(wakeOnLanFeature, local)).toBe(true);
  expect(isFeatureAvailable(wakeOnLanFeature, server(true).ctx)).toBe(true);
  expect(isFeatureAvailable(wakeOnLanFeature, server(false).ctx)).toBe(false);
});

test("the action needs a mac address", () => {
  expect(action.isAvailable(host, local)).toBe(true);
  expect(action.isAvailable({ ...host, macAddress: "" }, local)).toBe(false);
});

test("This device sends from the phone", async () => {
  await run(local);
  expect(wakeFromDevice).toHaveBeenCalledWith(host);
  expect(toast.success).toHaveBeenCalledWith("Wake-on-LAN sent to Nas");
});

test("a server host follows its origin", async () => {
  const s = server();
  (originOf as jest.Mock).mockResolvedValueOnce("server");
  await run(s.ctx);
  expect(s.wakeHost).toHaveBeenCalledWith(42);
  expect(wakeFromDevice).not.toHaveBeenCalled();

  (originOf as jest.Mock).mockResolvedValueOnce("device");
  await run(s.ctx);
  expect(wakeFromDevice).toHaveBeenCalledTimes(1);
  expect(s.wakeHost).toHaveBeenCalledTimes(1);
});

test("automatic tries the server, then the phone", async () => {
  const s = server();
  (originOf as jest.Mock).mockResolvedValue("auto");
  expect(await wakeRoute(host, s.ctx)).toBe("either");
  s.wakeHost.mockRejectedValueOnce(new Error("down"));
  await run(s.ctx);
  expect(wakeFromDevice).toHaveBeenCalledTimes(1);
  expect(toast.success).toHaveBeenCalled();
});

test("a failure shows its message", async () => {
  (wakeFromDevice as jest.Mock).mockRejectedValueOnce(
    new Error("This host has no valid MAC address."),
  );
  await run(local);
  expect(toast.error).toHaveBeenCalledWith(
    "This host has no valid MAC address.",
  );
});
