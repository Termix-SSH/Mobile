import { AccountClient } from "@/core/api/AccountClient";
import { parseServerPlugins } from "@/core/api/compat/server-features";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

async function client(
  generation: "legacy" | "plugin",
  plugins: unknown[] | null,
) {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://t.example",
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", generation);
  if (plugins) await c.storage.data.setJson("enabledPlugins", plugins);
  await c.load();
  return c;
}

test("only enabled and running plugins count", () => {
  const plugins = parseServerPlugins([
    { id: "ssh-terminal", enabled: true, state: "active" },
    { id: "docker", enabled: false, state: "disabled" },
    { id: "tunnels", enabled: true, state: "failed" },
    { id: "snippets" },
    { name: "no id" },
  ])!.filter((p) => p.active);
  expect(plugins.map((p) => p.id)).toEqual(["ssh-terminal", "snippets"]);
});

test("cached lists survive a JSON round trip", () => {
  const plugins = parseServerPlugins([
    {
      id: "remote-desktop",
      enabled: true,
      state: "active",
      contributes: { protocols: [{ id: "rdp" }] },
    },
  ]);
  expect(parseServerPlugins(JSON.parse(JSON.stringify(plugins)))).toEqual([
    {
      id: "remote-desktop",
      active: true,
      enabled: true,
      state: "active",
      protocols: ["rdp"],
    },
  ]);
  expect(parseServerPlugins("nope")).toBeNull();
});

test("the full list keeps plugins that are off, with name and mobile info", () => {
  const all = parseServerPlugins([
    {
      id: "databases",
      name: "Databases",
      enabled: false,
      state: "disabled",
      contributes: { mobile: { mode: "webview", views: ["databases"] } },
    },
    { id: "docker", enabled: true, state: "active" },
  ])!;
  expect(all).toEqual([
    {
      id: "databases",
      name: "Databases",
      active: false,
      enabled: false,
      state: "disabled",
      mobile: { mode: "webview", views: ["databases"] },
    },
    { id: "docker", active: true, enabled: true, state: "active" },
  ]);
  // The cached copy reads back the same.
  expect(parseServerPlugins(JSON.parse(JSON.stringify(all)))).toEqual(all);
});

test("the plugin list loads from the old cache key of earlier builds", async () => {
  const c = await client("plugin", [{ id: "ssh-terminal" }]);
  expect(c.serverPlugins).toEqual([{ id: "ssh-terminal", active: true }]);
});

test("older servers and an unknown plugin list keep everything on", async () => {
  const legacy = await client("legacy", null);
  expect(legacy.supports({ plugin: "docker" })).toBe(true);
  const unknown = await client("plugin", null);
  expect(unknown.supports({ plugin: "docker" })).toBe(true);
});

test("plugins that are off are not supported", async () => {
  const c = await client("plugin", [{ id: "ssh-terminal" }]);
  expect(c.supports({ plugin: "ssh-terminal" })).toBe(true);
  expect(c.supports({ plugin: "docker" })).toBe(false);
});

test("protocol plugins follow their declared protocols", async () => {
  const c = await client("plugin", [
    { id: "remote-desktop", protocols: ["rdp", "vnc"] },
  ]);
  expect(c.supports({ plugin: "remote-desktop", protocol: "rdp" })).toBe(true);
  expect(c.supports({ plugin: "remote-desktop", protocol: "vnc" })).toBe(true);
  expect(c.supports({ plugin: "remote-desktop", protocol: "telnet" })).toBe(
    false,
  );
  await resetStorage();
  const noList = await client("plugin", [{ id: "remote-desktop" }]);
  expect(
    noList.supports({ plugin: "remote-desktop", protocol: "telnet" }),
  ).toBe(true);
});

test("plugin only features are off on older servers", async () => {
  const legacy = await client("legacy", null);
  expect(legacy.supports({ plugin: "tailscale", pluginApiOnly: true })).toBe(
    false,
  );
  const on = await client("plugin", [{ id: "tailscale" }]);
  expect(on.supports({ plugin: "tailscale", pluginApiOnly: true })).toBe(true);
});

test("plugins with a web frontend keep what a web view needs, cached or not", () => {
  const [alerts, sync] = parseServerPlugins([
    {
      id: "alerts",
      enabled: true,
      state: "active",
      frontend: true,
      css: true,
      assetVersion: "v9",
      locales: ["en", "de_DE", 3],
      icon: "Bell",
      contributes: { tabs: [{ id: "alerts" }] },
    },
    { id: "sync", enabled: true, state: "active", frontend: false },
  ])!;
  expect(alerts.frame).toEqual({
    css: true,
    assetVersion: "v9",
    locales: ["en", "de_DE"],
    icon: "Bell",
    contributes: { tabs: [{ id: "alerts" }] },
  });
  expect(sync.frame).toBeUndefined();
  // The cached copy is the parsed list, which must read back the same.
  const [again] = parseServerPlugins(JSON.parse(JSON.stringify([alerts])))!;
  expect(again).toEqual(alerts);
});

test("state, enabled and engine ranges come through and survive the cache", () => {
  const [first, second] = parseServerPlugins([
    {
      id: "alerts",
      enabled: true,
      state: "failed",
      engine: { api: "^1.13", termix: ">=26.10.6", junk: 1 },
    },
    { id: "docker", enabled: false, state: "disabled", engine: { api: 2 } },
  ])!;
  expect(first).toMatchObject({
    active: false,
    enabled: true,
    state: "failed",
    engine: { api: "^1.13", termix: ">=26.10.6" },
  });
  expect(second.engine).toBeUndefined();
  const [again] = parseServerPlugins(JSON.parse(JSON.stringify([first])))!;
  expect(again).toEqual(first);
});
