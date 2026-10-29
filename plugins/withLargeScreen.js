const { withAndroidManifest, withInfoPlist } = require("@expo/config-plugins");

const EXTRA_CONFIG_CHANGES = [
  "smallestScreenSize",
  "density",
  "layoutDirection",
];

const IPAD_ORIENTATIONS = [
  "UIInterfaceOrientationPortrait",
  "UIInterfaceOrientationPortraitUpsideDown",
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight",
];

// The camera only scans QR codes. Asking for it without these makes Play
// require a camera and hide the app from most Chromebooks, cars and tablets.
const OPTIONAL_FEATURES = [
  "android.hardware.camera",
  "android.hardware.camera.autofocus",
];

/** Marks the camera features as not required, replacing any earlier entries. */
function optionalFeatures(manifest) {
  const others = (manifest["uses-feature"] || []).filter(
    (f) => !OPTIONAL_FEATURES.includes(f.$["android:name"]),
  );
  manifest["uses-feature"] = [
    ...others,
    ...OPTIONAL_FEATURES.map((name) => ({
      $: { "android:name": name, "android:required": "false" },
    })),
  ];
  return manifest;
}

/** Adds config change flags without dropping the ones already there. */
function mergeConfigChanges(current) {
  const parts = (current || "").split("|").filter(Boolean);
  for (const flag of EXTRA_CONFIG_CHANGES) {
    if (!parts.includes(flag)) parts.push(flag);
  }
  return parts.join("|");
}

/**
 * Tablets, foldables and resizable windows. The activity handles window
 * changes itself so folding or resizing never restarts a session. iPad windows
 * can be resized (Stage Manager) and use every orientation.
 */
const withLargeScreen = (config) => {
  config = withAndroidManifest(config, (config) => {
    optionalFeatures(config.modResults.manifest);
    const app = config.modResults.manifest.application?.[0];
    const activity = app?.activity?.find(
      (a) => a.$["android:name"] === ".MainActivity",
    );
    if (app) app.$["android:resizeableActivity"] = "true";
    if (activity) {
      activity.$["android:configChanges"] = mergeConfigChanges(
        activity.$["android:configChanges"],
      );
      activity.$["android:resizeableActivity"] = "true";
    }
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults.UIRequiresFullScreen = false;
    config.modResults["UISupportedInterfaceOrientations~ipad"] =
      IPAD_ORIENTATIONS;
    return config;
  });

  return config;
};

module.exports = withLargeScreen;
module.exports.mergeConfigChanges = mergeConfigChanges;
module.exports.optionalFeatures = optionalFeatures;
