import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

async function clientFor(generation: "legacy" | "plugin") {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://t.example",
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", generation);
  await c.load();
  return c;
}

type Call = (c: AccountClient) => Promise<unknown>;

// One call per domain, with the path each server generation must see.
const CASES: [string, Call, string, string][] = [
  ["hosts", (c) => c.api.hosts.getSSHHosts(), "/host/db/host", "/host/db/host"],
  [
    "tunnels",
    (c) => c.api.tunnels.getTunnelStatuses(),
    "/ssh/tunnel/status",
    "/plugin-api/tunnels/status",
  ],
  [
    "terminal",
    (c) => c.api.terminal.getCommandHistory(3),
    "/terminal/command_history/3",
    "/plugin-api/ssh-terminal/command-history/3",
  ],
  [
    "credentials",
    (c) => c.api.credentials.getCredentials(),
    "/credentials",
    "/credentials",
  ],
  ["openTabs", (c) => c.api.openTabs.getOpenTabs(), "/open-tabs", "/open-tabs"],
  [
    "apiKeys",
    (c) => c.api.apiKeys.getApiKeys(),
    "/users/api-keys",
    "/users/api-keys",
  ],
  ["users", (c) => c.api.users.getUserList(), "/users/list", "/users/list"],
  [
    "homepage",
    (c) => c.api.homepage.getUptime(),
    "/uptime",
    "/dashboard/uptime",
  ],
  [
    "wakeOnLan",
    (c) => c.api.wakeOnLan.wakeHost(9),
    "/host/db/host/9/wake",
    "/plugin-api/wake-on-lan/host/9/wake",
  ],
  [
    "totp",
    (c) => c.api.totp.setupTOTP(),
    "/users/totp/setup",
    "/plugin-api/totp/setup",
  ],
];

test.each(CASES)(
  "%s reaches the right route",
  async (_, call, legacy, plugin) => {
    for (const [generation, path] of [
      ["legacy", legacy],
      ["plugin", plugin],
    ] as const) {
      const seen = fakeServer(() => ({ data: [] }));
      await call(await clientFor(generation));
      expect([generation, seen[0].url]).toEqual([
        generation,
        `https://t.example${path}`,
      ]);
    }
  },
);

test("every module is built for the client", async () => {
  const c = await clientFor("legacy");
  for (const [domain, mod] of Object.entries(c.api)) {
    expect([domain, typeof mod]).toEqual([domain, "object"]);
    for (const fn of Object.values(mod)) expect(typeof fn).toBe("function");
  }
});

test("host saves send the parent host only when the form sets it", async () => {
  const base = {
    ip: "10.0.0.1",
    port: 22,
    username: "root",
    authType: "password" as const,
  };
  const seen = fakeServer(() => ({ data: { id: 4 } }));
  const c = await clientFor("legacy");
  await c.api.hosts.updateSSHHost(4, { ...base, parentHostId: 2 });
  await c.api.hosts.updateSSHHost(4, { ...base });
  expect(seen[0].data).toMatchObject({ parentHostId: 2 });
  expect(seen[1].data).not.toHaveProperty("parentHostId");
});

test("a host list reads the parent host as a number", async () => {
  fakeServer(() => ({
    data: [
      { id: 1, parentHostId: null },
      { id: 2, parentHostId: "1" },
    ],
  }));
  const list = await (await clientFor("legacy")).api.hosts.getSSHHosts();
  expect(list.map((h) => h.parentHostId)).toEqual([null, 1]);
});
