import { setNotificationsModule } from "@/core/push/native";
import { getPushPref, resetPushPrefsCache } from "@/core/push/prefs";
import {
  forgetPushAccount,
  setPushPref,
  syncPushAccount,
  syncPushAll,
} from "@/core/push/register";
import { plainStore } from "@/core/storage/kv";

type Device = { installId: string };

const mockClients: Record<string, ReturnType<typeof fakeClient>> = {};
const mockAccounts: { id: string; kind: string }[] = [];

function fakeClient(opts: { alerts?: boolean; outdated?: boolean } = {}) {
  const linked: Device[] = [];
  const puts: { id: string; body: Record<string, unknown> }[] = [];
  const removed: string[] = [];
  return {
    linked,
    puts,
    removed,
    apiGeneration: "plugin",
    load: async () => {},
    isAuthenticated: () => true,
    api: {
      alerts: {
        available: () => opts.alerts !== false,
        putDevice: async (id: string, body: Record<string, unknown>) => {
          if (opts.outdated) return "outdated";
          puts.push({ id, body });
          if (!linked.some((d) => d.installId === id))
            linked.push({ installId: id });
          return { installId: id };
        },
        devices: async () => [...linked],
        removeDevice: async (id: string) => {
          removed.push(id);
          linked.splice(
            linked.findIndex((d) => d.installId === id),
            1,
          );
        },
      },
    },
  };
}

jest.mock("@/core/accounts", () => ({
  accounts: {
    list: () => mockAccounts,
    client: (id: string) => mockClients[id] ?? null,
  },
}));

jest.mock("@/core/sync/device", () => ({
  deviceId: async () => "mobile-test-install",
  deviceName: () => "Termix Mobile on Pixel",
}));

let granted = true;
const notifications = {
  getPermissionsAsync: async () => ({ granted, canAskAgain: true }),
  requestPermissionsAsync: async () => ({ granted }),
  getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[abc]" }),
};

beforeEach(async () => {
  granted = true;
  for (const key of Object.keys(mockClients)) delete mockClients[key];
  mockAccounts.length = 0;
  await plainStore.remove("push.prefs");
  resetPushPrefsCache();
  setNotificationsModule(notifications as never);
});

afterAll(() => setNotificationsModule(undefined));

function addServer(id: string, opts?: Parameters<typeof fakeClient>[0]) {
  mockAccounts.push({ id, kind: "server" });
  mockClients[id] = fakeClient(opts);
  return mockClients[id];
}

describe("push registration", () => {
  it("links this phone when turned on, with the chosen severity", async () => {
    const client = addServer("acc1");
    expect(await setPushPref("acc1", { enabled: true })).toBe("on");
    expect(client.puts).toEqual([
      {
        id: "mobile-test-install",
        body: expect.objectContaining({
          token: "ExponentPushToken[abc]",
          accountKey: "acc1",
          name: "Termix Mobile on Pixel",
          minSeverity: "warning",
          enabled: true,
        }),
      },
    ]);
    expect((await getPushPref("acc1")).registered).toBe(true);

    await setPushPref("acc1", { minSeverity: "critical" });
    expect(client.puts[1].body.minSeverity).toBe("critical");
  });

  it("unlinks when turned off", async () => {
    const client = addServer("acc1");
    await setPushPref("acc1", { enabled: true });
    expect(await setPushPref("acc1", { enabled: false })).toBe("off");
    expect(client.removed).toEqual(["mobile-test-install"]);
    expect((await getPushPref("acc1")).registered).toBe(false);
  });

  it("says when permission is refused", async () => {
    addServer("acc1");
    granted = false;
    expect(await setPushPref("acc1", { enabled: true })).toBe("denied");
    expect((await getPushPref("acc1")).enabled).toBe(false);
  });

  it("says when the server's Alerts plugin is too old or off", async () => {
    addServer("old", { outdated: true });
    addServer("none", { alerts: false });
    expect(await setPushPref("old", { enabled: true })).toBe("outdated");
    expect(await setPushPref("none", { enabled: true })).toBe("unavailable");
  });

  it("turns off here when the phone was removed on the web", async () => {
    const client = addServer("acc1");
    await setPushPref("acc1", { enabled: true });
    client.linked.length = 0;
    expect(await syncPushAccount("acc1")).toBe("off");
    expect(await getPushPref("acc1")).toMatchObject({
      enabled: false,
      registered: false,
    });
  });

  it("syncs every server and skips ones that are off", async () => {
    const on = addServer("on");
    const off = addServer("off");
    await setPushPref("on", { enabled: true });
    on.puts.length = 0;
    await syncPushAll();
    expect(on.puts).toHaveLength(1);
    expect(off.puts).toHaveLength(0);
  });

  it("tells the server before signing out", async () => {
    const client = addServer("acc1");
    await setPushPref("acc1", { enabled: true });
    await forgetPushAccount("acc1");
    expect(client.removed).toEqual(["mobile-test-install"]);
    expect((await getPushPref("acc1")).enabled).toBe(false);
  });

  it("runs syncs for one server one at a time", async () => {
    const client = addServer("acc1");
    await setPushPref("acc1", { enabled: true });
    let open = 0;
    let most = 0;
    const put = client.api.alerts.putDevice;
    client.api.alerts.putDevice = async (id, body) => {
      open++;
      most = Math.max(most, open);
      await new Promise((r) => setTimeout(r, 5));
      open--;
      return put(id, body);
    };
    await Promise.all([1, 2, 3, 4].map(() => syncPushAccount("acc1")));
    expect(most).toBe(1);
  });

  it("does nothing in a build without notifications", async () => {
    setNotificationsModule(null);
    addServer("acc1");
    expect(await syncPushAccount("acc1")).toBe("unavailable");
  });
});
