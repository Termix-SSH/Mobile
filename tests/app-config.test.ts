const config = require("../app.json").expo;

test("Android never backs up app data", () => {
  expect(config.android.allowBackup).toBe(false);
});

test("the local database is built with SQLCipher", () => {
  const sqlite = config.plugins.find(
    (p: unknown) => Array.isArray(p) && p[0] === "expo-sqlite",
  );
  expect(sqlite?.[1]).toEqual({ useSQLCipher: true });
});

describe("no backups or device transfer", () => {
  const plugin = require("../plugins/withNoBackup.js");

  test("the plugin is on and secure store leaves backup rules to it", () => {
    expect(config.plugins).toContain("./plugins/withNoBackup.js");
    expect(config.plugins).toContainEqual([
      "expo-secure-store",
      { configureAndroidBackup: false },
    ]);
  });

  test("cloud backup and device transfer both exclude every kind of storage", () => {
    const rules: string = plugin.DATA_EXTRACTION_RULES;
    for (const section of ["cloud-backup", "device-transfer"]) {
      const body = rules.split(`<${section}>`)[1].split(`</${section}>`)[0];
      for (const domain of [
        "root",
        "file",
        "database",
        "sharedpref",
        "external",
      ]) {
        expect(body).toContain(`<exclude domain="${domain}" path="." />`);
      }
    }
    expect(plugin.FULL_BACKUP_CONTENT).toContain(
      '<exclude domain="database" path="." />',
    );
  });

  test("the manifest points at the rules", async () => {
    const out = plugin({ name: "t", slug: "t" });
    const manifest = {
      manifest: {
        application: [{ $: { "android:name": ".MainApplication" } }],
      },
    };
    const result = await out.mods.android.manifest({
      ...out,
      modResults: manifest,
      modRequest: { platform: "android", modName: "manifest" },
    });
    expect(result.modResults.manifest.application[0].$).toMatchObject({
      "android:allowBackup": "false",
      "android:dataExtractionRules": "@xml/termix_data_extraction_rules",
      "android:fullBackupContent": "@xml/termix_backup_rules",
    });
  });
});
