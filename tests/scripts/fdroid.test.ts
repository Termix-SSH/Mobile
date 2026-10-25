const {
  applyFdroid,
  findBlocked,
  stripPackageJson,
  versionCode,
} = require("../../scripts/fdroid.cjs");
const appConfig = require("../../app.config.js");
const base = require("../../app.json").expo;

test("version codes come from major, minor and patch", () => {
  expect(versionCode("2.0.0")).toBe(20000);
  expect(versionCode("2.10.3")).toBe(21003);
  expect(versionCode("2.1.0-beta.2")).toBe(20100);
  expect(() => versionCode("two")).toThrow();
  expect(() => versionCode("2.100.0")).toThrow();
});

test("the F-Droid config drops download and dev plugins and adds its own", () => {
  const out = applyFdroid(base);
  const names = out.plugins.map((p: unknown) => (Array.isArray(p) ? p[0] : p));
  expect(names).not.toContain("expo-dev-client");
  expect(names).not.toContain("./plugins/withTermixSsh.js");
  expect(names).not.toContain("./plugins/withTermixTerminal.js");
  expect(names).toContain("./plugins/withFdroid.js");
  expect(names).toContain("expo-router");
  expect(out.android.versionCode).toBe(20000);
  expect(out.extra.distribution).toBe("fdroid");
  expect(out.extra.router).toEqual(base.extra.router);
});

test("applyFdroid leaves the input alone", () => {
  const before = JSON.stringify(base);
  applyFdroid(base);
  expect(JSON.stringify(base)).toBe(before);
});

test("app.config.js only changes the config with TERMIX_FDROID=1", () => {
  const saved = process.env.TERMIX_FDROID;
  try {
    delete process.env.TERMIX_FDROID;
    expect(appConfig({ config: base })).toBe(base);
    process.env.TERMIX_FDROID = "1";
    expect(appConfig({ config: base }).extra.distribution).toBe("fdroid");
  } finally {
    if (saved === undefined) delete process.env.TERMIX_FDROID;
    else process.env.TERMIX_FDROID = saved;
  }
});

test("package.json loses the packages F-Droid cannot take", () => {
  const out = stripPackageJson({
    dependencies: {
      "expo-application": "1",
      "expo-dev-client": "1",
      expo: "1",
    },
  });
  expect(out.dependencies).toEqual({ expo: "1" });
});

test("a dependency report with Play Services or ML Kit is flagged", () => {
  const report = [
    "+--- com.facebook.react:react-android:0.86.3",
    "+--- com.google.mlkit:barcode-scanning:17.3.0",
    "+--- com.android.installreferrer:installreferrer:2.2",
    "+--- androidx.core:core-ktx:1.13.1",
  ].join("\n");
  expect(findBlocked(report)).toHaveLength(2);
  expect(findBlocked("+--- androidx.core:core-ktx:1.13.1")).toEqual([]);
});
