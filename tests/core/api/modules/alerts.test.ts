import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

const ROOT = "https://termix.example";

async function client(
  generation: "plugin" | "legacy",
  plugins: unknown[] = [{ id: "alerts", enabled: true, state: "active" }],
) {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: `${ROOT}/`,
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", generation);
  await c.storage.data.setJson("enabledPlugins", plugins);
  await c.load();
  return c;
}

test("lists the inbox with read state and the unread count", async () => {
  const seen = fakeServer(() => ({
    data: {
      items: [
        {
          id: 4,
          title: "Host online",
          body: "web is back",
          severity: "info",
          source: "host-status",
          createdAt: "2026-11-18T10:00:00Z",
          readAt: null,
        },
        { id: 3, title: "Old", body: null, readAt: "2026-11-17T10:00:00Z" },
      ],
      unread: 120,
    },
  }));
  const c = await client("plugin");
  const page = await c.api.alerts.list({ unread: false });
  expect(page.unread).toBe(120);
  expect(page.items).toEqual([
    {
      id: "4",
      title: "Host online",
      message: "web is back",
      severity: "info",
      source: "host-status",
      createdAt: "2026-11-18T10:00:00Z",
      read: false,
    },
    {
      id: "3",
      title: "Old",
      message: "",
      severity: "info",
      source: undefined,
      createdAt: undefined,
      read: true,
    },
  ]);
  expect(seen[0].url).toBe(`${ROOT}/plugin-api/alerts/items`);
  expect(seen[0].params).toMatchObject({ limit: 50 });
});

test("marks all read, deletes and clears read alerts", async () => {
  const seen = fakeServer(() => ({ data: { count: 0 } }));
  const c = await client("plugin");
  await c.api.alerts.markRead("all");
  await c.api.alerts.markRead(["7"]);
  await c.api.alerts.remove("7");
  await c.api.alerts.clear(true);
  expect(
    seen.map((r) => [r.method, r.url.replace(ROOT, ""), r.data, r.params]),
  ).toEqual([
    ["POST", "/plugin-api/alerts/items/read", { all: true }, undefined],
    ["POST", "/plugin-api/alerts/items/read", { ids: [7] }, undefined],
    ["DELETE", "/plugin-api/alerts/items/7", undefined, undefined],
    ["DELETE", "/plugin-api/alerts/items", undefined, { read: true }],
  ]);
});

test("no requests when the alerts plugin is off", async () => {
  const seen = fakeServer(() => ({ data: {} }));
  const c = await client("plugin", []);
  expect(c.api.alerts.available()).toBe(false);
  expect(await c.api.alerts.list()).toEqual({ items: [], unread: 0 });
  expect(await c.api.alerts.unreadCount()).toBe(0);
  expect(seen).toEqual([]);
});

test("older servers dismiss instead of delete", async () => {
  const seen = fakeServer((req) =>
    req.method === "GET"
      ? { data: { alerts: [{ id: "a1", title: "T", message: "M" }] } }
      : { data: {} },
  );
  const c = await client("legacy");
  expect(c.api.alerts.canDelete()).toBe(false);
  expect(await c.api.alerts.unreadCount()).toBe(1);
  await c.api.alerts.remove("a1");
  expect(seen.at(-1)).toMatchObject({
    method: "POST",
    url: `${ROOT}/alerts/dismiss`,
    data: { alertId: "a1" },
  });
});
