import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

const device = {
  id: "device-1",
  hostname: "build-server",
  name: "build-server.example.ts.net",
  addresses: ["fd7a:115c:a1e0::1", "100.76.12.1"],
  os: "linux",
  lastSeen: "2026-10-20T12:00:00Z",
};

async function pluginClient(
  serverUrl = "https://termix.example/base/ssh/",
  plugins: unknown[] = [{ id: "tailscale", enabled: true, state: "active" }],
) {
  const c = new AccountClient({
    accountId: "a",
    serverUrl,
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", "plugin");
  await c.storage.data.setJson("enabledPlugins", plugins);
  await c.load();
  return c;
}

test("discovery calls the plugin endpoint at the server root", async () => {
  for (const [serverUrl, root] of [
    ["https://termix.example/base/ssh/", "https://termix.example/base"],
    ["https://termix.example/base/", "https://termix.example/base"],
  ]) {
    const seen = fakeServer(() => ({
      data: { devices: [device], hasApiKey: true },
    }));
    const c = await pluginClient(serverUrl);
    expect(await c.api.tailscale.getTailscaleDevices()).toEqual({
      devices: [device],
      hasApiKey: true,
    });
    expect(seen.map((r) => r.url)).toEqual([
      `${root}/plugin-api/tailscale/devices`,
    ]);
  }
});

test("API key and upstream errors keep their message", async () => {
  for (const status of [401, 500, 502]) {
    const body = {
      devices: [],
      hasApiKey: status !== 500,
      error: `Failure ${status}`,
    };
    fakeServer(() => ({ status, data: { ...body, apiKey: "secret" } }));
    const c = await pluginClient();
    expect(await c.api.tailscale.getTailscaleDevices()).toEqual(body);
  }
});

test("missing permissions never expose devices", async () => {
  fakeServer(() => ({
    status: 403,
    data: { devices: [device], hasApiKey: true, error: "Missing permission" },
  }));
  const c = await pluginClient();
  expect(await c.api.tailscale.getTailscaleDevices()).toEqual({
    devices: [],
    hasApiKey: true,
    error: "forbidden",
  });
});

test("a missing plugin or an unknown payload reads as unavailable", async () => {
  for (const reply of [
    { status: 404, data: { devices: [], hasApiKey: true, error: "nope" } },
    { status: 200, data: { message: "ok" } },
  ]) {
    fakeServer(() => reply);
    const c = await pluginClient();
    expect(await c.api.tailscale.getTailscaleDevices()).toBeNull();
  }
});

test("network failures are passed on", async () => {
  const failure = new Error("Network unavailable");
  fakeServer(() => failure);
  const c = await pluginClient();
  await expect(c.api.tailscale.getTailscaleDevices()).rejects.toBe(failure);
});

test("discovery needs a 2.9 server with the Tailscale plugin on", async () => {
  const off = await pluginClient(undefined, [{ id: "ssh-terminal" }]);
  expect(off.api.tailscale.isTailscaleAvailable()).toBe(false);
  await resetStorage();
  const on = await pluginClient();
  expect(on.api.tailscale.isTailscaleAvailable()).toBe(true);
  const legacy = new AccountClient({
    accountId: "b",
    serverUrl: "https://old.example",
    storage: accountStorage("b"),
  });
  expect(legacy.api.tailscale.isTailscaleAvailable()).toBe(false);
});
