import AsyncStorage from "@react-native-async-storage/async-storage";
import { AccountStore } from "@/core/accounts/store";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

test("a 1.x server login becomes the active linked account", async () => {
  await AsyncStorage.multiSet([
    ["serverConfig", JSON.stringify({ serverUrl: "https://termix.example/" })],
    ["jwt", "old-token"],
    ["apiGeneration:https://termix.example/", "plugin"],
    ["enabledPlugins:https://termix.example/", '[{"id":"docker"}]'],
  ]);
  const s = new AccountStore({ newId: () => "m1" });
  await s.init();

  const active = s.active();
  expect(active).toMatchObject({
    id: "m1",
    kind: "server",
    serverUrl: "https://termix.example",
    status: "idle",
  });
  const client = s.activeClient()!;
  expect(client.token()).toBe("old-token");
  expect(client.isPluginApi()).toBe(true);
  expect(client.isPluginEnabled("docker")).toBe(true);

  // The token moved to secure storage and the plain keys are gone.
  expect(await accountStorage("m1").secrets.get("session")).toBe("old-token");
  for (const key of [
    "jwt",
    "serverConfig",
    "apiGeneration:https://termix.example/",
    "enabledPlugins:https://termix.example/",
  ]) {
    expect(await AsyncStorage.getItem(key)).toBeNull();
  }
});

test("the oldest server key works too, signed out without a token", async () => {
  await AsyncStorage.setItem(
    "server",
    JSON.stringify({ name: "Server", ip: "http://10.0.0.5:8080" }),
  );
  const s = new AccountStore({ newId: () => "m2" });
  await s.init();
  expect(s.active()).toMatchObject({
    serverUrl: "http://10.0.0.5:8080",
    status: "signed_out",
  });
  expect(s.activeClient()!.token()).toBeNull();
});

test("migration runs once", async () => {
  await AsyncStorage.setItem(
    "serverConfig",
    JSON.stringify({ serverUrl: "https://a.example" }),
  );
  await new AccountStore({ newId: () => "x" }).init();
  // Something writes the old key again; it must not create a second account.
  await AsyncStorage.setItem(
    "serverConfig",
    JSON.stringify({ serverUrl: "https://b.example" }),
  );
  const s = new AccountStore({ newId: () => "y" });
  await s.init();
  expect(s.list().map((a) => a.id)).toEqual(["local", "x"]);
});
