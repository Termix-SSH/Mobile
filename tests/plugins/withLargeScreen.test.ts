const config = require("../../app.json").expo;
const {
  mergeConfigChanges,
  optionalFeatures,
} = require("../../plugins/withLargeScreen");

test("the large screen plugin is registered", () => {
  expect(config.plugins).toContain("./plugins/withLargeScreen.js");
});

test("window change flags are added once and the old ones stay", () => {
  const out = mergeConfigChanges("keyboard|orientation|screenSize|density");
  expect(out.split("|")).toEqual([
    "keyboard",
    "orientation",
    "screenSize",
    "density",
    "smallestScreenSize",
    "layoutDirection",
  ]);
  expect(mergeConfigChanges(out)).toBe(out);
});

test("an empty value gets the flags", () => {
  expect(mergeConfigChanges(undefined)).toBe(
    "smallestScreenSize|density|layoutDirection",
  );
});

test("the camera is optional, so devices without one still get the app", () => {
  const manifest = optionalFeatures({
    "uses-feature": [
      {
        $: {
          "android:name": "android.hardware.camera",
          "android:required": "true",
        },
      },
      { $: { "android:name": "android.hardware.wifi" } },
    ],
  });
  const features = manifest["uses-feature"].map(
    (f: { $: Record<string, string> }) => f.$,
  );
  expect(features).toContainEqual({ "android:name": "android.hardware.wifi" });
  for (const name of [
    "android.hardware.camera",
    "android.hardware.camera.autofocus",
  ]) {
    const entries = features.filter(
      (f: Record<string, string>) => f["android:name"] === name,
    );
    expect(entries).toEqual([
      { "android:name": name, "android:required": "false" },
    ]);
  }
});
