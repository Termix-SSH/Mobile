import { AccountClient } from "@/core/api/AccountClient";
import { parseVaultProfiles } from "@/core/api/modules/vault";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

async function pluginClient(
  plugins: unknown[] = [{ id: "vault", enabled: true, state: "active" }],
) {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://termix.example/base/",
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", "plugin");
  await c.storage.data.setJson("enabledPlugins", plugins);
  await c.load();
  return c;
}

const profile = { id: 3, name: "Prod", vaultAddr: "https://v", sshRole: "ops" };

test("profiles come from the plugin at the server root", async () => {
  const seen = fakeServer(() => ({ data: [profile, { id: "x", name: 4 }] }));
  const c = await pluginClient();
  expect(await c.api.vault.listProfiles()).toEqual([profile]);
  expect(seen.map((r) => r.url)).toEqual([
    "https://termix.example/base/plugin-api/vault/profiles",
  ]);
});

test("a wrapped list is read too", () => {
  expect(parseVaultProfiles({ profiles: [profile] })).toEqual([profile]);
  expect(parseVaultProfiles("nope")).toEqual([]);
});

test("no permission is an empty list, a missing plugin is null", async () => {
  fakeServer(() => ({ status: 403, data: { error: "no" } }));
  expect(await (await pluginClient()).api.vault.listProfiles()).toEqual([]);
  for (const reply of [
    { status: 404, data: { error: "no" } },
    { status: 200, data: "<!doctype html><html></html>" },
  ]) {
    fakeServer(() => reply);
    expect(await (await pluginClient()).api.vault.listProfiles()).toBeNull();
  }
});

test("network failures are passed on", async () => {
  const failure = new Error("Network unavailable");
  fakeServer(() => failure);
  await expect((await pluginClient()).api.vault.listProfiles()).rejects.toBe(
    failure,
  );
});

test("it needs a 2.9 server with the Vault plugin on", async () => {
  expect(
    (await pluginClient([{ id: "ssh-terminal" }])).api.vault.isVaultAvailable(),
  ).toBe(false);
  await resetStorage();
  expect((await pluginClient()).api.vault.isVaultAvailable()).toBe(true);
});
