import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

async function plugin(version?: string) {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://t.example",
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", "plugin");
  await c.storage.data.setJson("enabledPlugins", [
    { id: "tunnels", ...(version ? { version } : {}) },
  ]);
  await c.load();
  return c;
}

test("reads saved tunnels by host id", async () => {
  const seen = fakeServer(() => ({
    data: [{ hostId: 4, connections: [{ sourcePort: 1 }] }],
  }));
  const c = await plugin("1.2.1");
  expect(c.supportsSavedTunnels()).toBe(true);
  expect(await c.api.tunnels.getSavedTunnels()).toEqual({
    4: [{ sourcePort: 1 }],
  });
  expect(seen[0].url).toBe("https://t.example/plugin-api/tunnels/saved");
});

test("an older plugin has no saved routes", async () => {
  fakeServer(() => ({ status: 404, data: {} }));
  const c = await plugin("1.1.0");
  expect(c.supportsSavedTunnels()).toBe(false);
  expect(await c.api.tunnels.getSavedTunnels()).toBeNull();
  expect(await c.api.tunnels.getGateways()).toEqual([]);
});

test("saves the whole list for a host without extra fields", async () => {
  const seen = fakeServer(() => ({ data: {} }));
  const c = await plugin("1.2.0");
  await c.api.tunnels.putSavedTunnels(7, [
    { sourcePort: 1, endpointPort: 2, scope: "c2s" } as any,
  ]);
  expect(seen[0]).toMatchObject({
    method: "PUT",
    url: "https://t.example/plugin-api/tunnels/saved/7",
    data: { connections: [{ sourcePort: 1, endpointPort: 2 }] },
  });
});

test("a 404 on save falls back to the host setting", async () => {
  const seen = fakeServer((req) =>
    req.url.includes("/saved/") ? { status: 404, data: {} } : { data: {} },
  );
  const c = await plugin("1.2.0");
  await c.api.tunnels.putSavedTunnels(7, []);
  expect(seen[1].url).toBe("https://t.example/plugins/tunnels/settings/host/7");
});
