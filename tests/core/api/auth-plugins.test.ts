import { AccountClient } from "@/core/api/AccountClient";
import { serverAuthPlugin } from "@/core/transport/local/auth-support";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

async function client(plugins: unknown[] | null) {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://t.example",
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", "plugin");
  if (plugins) await c.storage.data.setJson("enabledPlugins", plugins);
  await c.load();
  return c;
}

const types = ["opkssh", "stepca", "vault"];
const needs = (c: AccountClient, type: string) =>
  c.supports({ plugin: serverAuthPlugin(type)!, pluginApiOnly: true });

test("each browser sign in shows only while its plugin is on", async () => {
  const c = await client([
    { id: "opkssh", enabled: true, state: "active" },
    { id: "vault", enabled: true, state: "active" },
  ]);
  expect(types.map((t) => needs(c, t))).toEqual([true, false, true]);
});

test("while the plugin list is unknown nothing flickers off", async () => {
  const c = await client(null);
  expect(types.every((t) => needs(c, t))).toBe(true);
});

test("an older server has none of them", async () => {
  const legacy = new AccountClient({
    accountId: "b",
    serverUrl: "https://old.example",
    storage: accountStorage("b"),
  });
  expect(types.some((t) => needs(legacy, t))).toBe(false);
});
