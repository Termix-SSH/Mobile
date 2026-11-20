const { withAndroidManifest, withInfoPlist } = require("@expo/config-plugins");

const EXTRA_CONFIG_CHANGES = ["smallestScreenSize", "layoutDirection"];

// React Native keeps the old density when the activity handles the change, so
// text gets cut off and taps land in the wrong place. Let Android restart it.
const DROPPED_CONFIG_CHANGES = ["density"];

const IPAD_ORIENTATIONS = [
  "UIInterfaceOrientationPortrait",
  "UIInterfaceOrientationPortraitUpsideDown",
  "UIInterfaceOrientationLandscapeLeft",
  "UIInterfaceOrientationLandscapeRight",
];

// Permissions and libraries imply these, and Play then hides the app from
// devices without them (Chromebooks, cars, tablets, XR). None are needed.
const OPTIONAL_FEATURES = [
  "android.hardware.camera",
  "android.hardware.camera.autofocus",
  "android.hardware.wifi",
  "android.hardware.screen.portrait",
  "android.hardware.screen.landscape",
];

/** Marks implied hardware features as not required, replacing any earlier entries. */
function optionalFeatures(manifest) {
  const others = (manifest["uses-feature"] || []).filter(
    (f) => !OPTIONAL_FEATURES.includes(f.$["android:name"]),
  );
  // replace, so a library asking for the feature can't make it required again
  manifest.$ = {
    ...manifest.$,
    "xmlns:tools": "http://schemas.android.com/tools",
  };
  manifest["uses-feature"] = [
    ...others,
    ...OPTIONAL_FEATURES.map((name) => ({
      $: {
        "android:name": name,
        "android:required": "false",
        "tools:node": "replace",
      },
    })),
  ];
  return manifest;
}

/** Adds config change flags, keeping the others except density. */
function mergeConfigChanges(current) {
  const parts = (current || "")
    .split("|")
    .filter((flag) => flag && !DROPPED_CONFIG_CHANGES.includes(flag));
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
