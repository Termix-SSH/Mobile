import { credentials, hosts } from "@/core/db/schema";
import { SCHEMA_VERSION } from "@/core/db/migrate";
import { createBackup, openBackup, restoreTables } from "@/core/db/backup";
import { resetStorage } from "../../helpers/http";
import { testStores } from "../../helpers/db";

beforeEach(resetStorage);

// Cheap scrypt so the tests stay fast.
const kdf = { N: 2 ** 10, r: 8, p: 1 };
const pass = "correct horse battery";

async function seeded() {
  const { stores } = testStores();
  const { db } = await stores.get("local");
  const cred = db
    .insert(credentials)
    .values({ syncId: "c1", name: "root key", authType: "key", key: "PRIVATE" })
    .returning()
    .get();
  const parent = db
    .insert(hosts)
    .values({
      syncId: "h1",
      ip: "10.0.0.1",
      port: 22,
      username: "root",
      authType: "credential",
      credentialId: cred.id,
    })
    .returning()
    .get();
  db.insert(hosts)
    .values({
      syncId: "h2",
      ip: "10.0.0.2",
      port: 22,
      username: "root",
      authType: "password",
      password: "hunter2",
      parentHostId: parent.id,
    })
    .run();
  return stores;
}

test("export then import gives back the same rows", async () => {
  const stores = await seeded();
  const file = await stores.exportBackup("local", pass, kdf);
  expect(file).not.toContain("hunter2");
  expect(file).not.toContain("PRIVATE");

  const { db } = await stores.get("local");
  const before = db.select().from(hosts).all();
  db.delete(hosts).run();
  db.delete(credentials).run();

  await stores.importBackup("local", file, pass);
  expect(db.select().from(hosts).all()).toEqual(before);
  expect(db.select().from(credentials).all()).toHaveLength(1);
});

test("import replaces what is there", async () => {
  const stores = await seeded();
  const file = await stores.exportBackup("local", pass, kdf);
  const { db } = await stores.get("local");
  db.insert(hosts)
    .values({
      syncId: "new",
      ip: "x",
      port: 22,
      username: "u",
      authType: "none",
    })
    .run();
  await stores.importBackup("local", file, pass);
  const ids = db
    .select()
    .from(hosts)
    .all()
    .map((h) => h.syncId)
    .sort();
  expect(ids).toEqual(["h1", "h2"]);
});

test("a wrong passphrase or changed data is refused", async () => {
  const stores = await seeded();
  const file = await stores.exportBackup("local", pass, kdf);
  await expect(openBackup(file, "wrong passphrase")).rejects.toMatchObject({
    code: "BACKUP_WRONG_PASSPHRASE",
  });
  const parsed = JSON.parse(file);
  const data = Buffer.from(parsed.data, "base64");
  data[5] ^= 1;
  parsed.data = data.toString("base64");
  await expect(openBackup(JSON.stringify(parsed), pass)).rejects.toMatchObject({
    code: "BACKUP_WRONG_PASSPHRASE",
  });
});

test("files that are not backups, or from a newer app, are refused", async () => {
  await expect(openBackup("not json", pass)).rejects.toMatchObject({
    code: "BACKUP_INVALID",
  });
  await expect(
    openBackup(JSON.stringify({ format: "other" }), pass),
  ).rejects.toMatchObject({ code: "BACKUP_INVALID" });

  const stores = await seeded();
  const parsed = JSON.parse(await stores.exportBackup("local", pass, kdf));
  parsed.schemaVersion = SCHEMA_VERSION + 1;
  await expect(openBackup(JSON.stringify(parsed), pass)).rejects.toMatchObject({
    code: "DB_TOO_NEW",
  });
  parsed.schemaVersion = SCHEMA_VERSION;
  parsed.kdf.N = 2 ** 30;
  await expect(openBackup(JSON.stringify(parsed), pass)).rejects.toMatchObject({
    code: "BACKUP_INVALID",
  });
});

test("short passphrases are refused", async () => {
  const stores = await seeded();
  await expect(
    stores.exportBackup("local", "short", kdf),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});

test("an older backup without newer columns still loads", async () => {
  const stores = await seeded();
  const { raw } = await stores.get("local");
  restoreTables(raw, {
    ssh_data: [
      {
        sync_id: "old",
        ip: "1.2.3.4",
        port: 22,
        username: "u",
        auth_type: "none",
        gone_column: 1,
      },
    ],
  });
  expect(raw.all("SELECT sync_id, enable_ssh FROM ssh_data")).toEqual([
    { sync_id: "old", enable_ssh: 1 },
  ]);
  await expect(createBackup(raw, pass, kdf)).resolves.toContain(
    "termix-backup",
  );
});

test("text survives the trip, including non ASCII", async () => {
  const stores = await seeded();
  const { db } = await stores.get("local");
  db.update(hosts).set({ name: "Zürich 東京 🚀" }).run();
  const file = await stores.exportBackup("local", pass, kdf);
  await stores.importBackup("local", file, pass);
  expect(
    db
      .select()
      .from(hosts)
      .all()
      .map((h) => h.name),
  ).toEqual(["Zürich 東京 🚀", "Zürich 東京 🚀"]);
});
