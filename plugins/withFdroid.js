const {
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} = require("@expo/config-plugins");

/** Drops the debug signing line from the release build type, so the APK stays unsigned. */
function unsignRelease(gradle) {
  return gradle.replace(
    /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[^}]*?)\n\s*signingConfig signingConfigs\.debug/,
    "$1",
  );
}

// F-Droid variant: no JitPack and an
// unsigned release APK, because F-Droid signs it.
const withFdroid = (config) => {
  config = withGradleProperties(config, (c) => {
    // Crunching PNGs differs between builds, so F-Droid asks for it off
    const png = "android.enablePngCrunchInReleaseBuilds";
    c.modResults = c.modResults.filter((p) => p.key !== png);
    c.modResults.push({ type: "property", key: png, value: "false" });
    return c;
  });
  config = withAppBuildGradle(config, (c) => {
    c.modResults.contents = unsignRelease(c.modResults.contents);
    return c;
  });
  return withProjectBuildGradle(config, (c) => {
    c.modResults.contents = c.modResults.contents.replace(
      /^\s*maven \{ url 'https:\/\/www\.jitpack\.io' \}\r?\n/m,
      "",
    );
    return c;
  });
};

module.exports = withFdroid;
module.exports.unsignRelease = unsignRelease;
