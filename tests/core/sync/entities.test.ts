import { adapterFor } from "@/core/sync/entities";
import { singletonSyncId } from "@/core/sync/protocol";
import { rowLabel, typeLabel } from "@/core/sync/settings";
import { testStores } from "../../helpers/db";

async function ctx() {
  const { stores } = testStores();
  const { db } = await stores.openForSync("acct");
  return { db, extra: () => null };
}

test("preferences round trip, with booleans as booleans and unknown fields kept apart", async () => {
  const c = await ctx();
  const prefs = adapterFor("userPreferences");
  const id = singletonSyncId("userPreferences");
  expect(prefs.load(c, id)).toBeNull();
  const result = prefs.write(c, {
    syncId: id,
    theme: "nord",
    showHostTags: 1,
    newFromServer: "x",
  });
  expect(result).toEqual({ missing: false, extra: { newFromServer: "x" } });
  const row = prefs.load(c, id)!;
  expect(row.theme).toBe("nord");
  expect(row.showHostTags).toBe(true);
  expect([...prefs.list(c).keys()]).toEqual([id]);
  prefs.remove(c, id);
  expect(prefs.load(c, id)).toBeNull();
});

test("host defaults keep their level, folder and JSON value", async () => {
  const c = await ctx();
  const defaults = adapterFor("hostDefaults");
  defaults.write(c, {
    syncId: "d1",
    level: "folder",
    folderSyncId: "f1",
    namespace: "ssh",
    key: "port",
    value: { n: 2222 },
  });
  defaults.write(c, { syncId: "d2", level: "odd", key: "user", value: "root" });
  expect(defaults.load(c, "d1")).toMatchObject({
    level: "folder",
    folderSyncId: "f1",
    value: { n: 2222 },
  });
  expect(defaults.load(c, "d2")).toMatchObject({
    level: "user",
    folderSyncId: null,
    namespace: "",
  });
  expect([...defaults.list(c).keys()].sort()).toEqual(["d1", "d2"]);
  defaults.remove(c, "d1");
  expect(defaults.load(c, "d1")).toBeNull();
});

test("unknown types share one generic adapter", () => {
  expect(adapterFor("somethingNew")).toBe(adapterFor("somethingNew"));
});

test("labels for sync settings lists", () => {
  expect(typeLabel("sshCredentials")).toBe("Login");
  expect(typeLabel("hostDefaults")).toBe("Host default");
  expect(typeLabel("other")).toBe("other");
  expect(rowLabel({ name: "web" })).toBe("web");
  expect(rowLabel({ key: "port" })).toBe("port");
  expect(rowLabel({ name: "" })).toBe("Untitled");
});
