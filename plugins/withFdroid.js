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

const GRADLE_PROPERTIES = {
  // Crunching PNGs differs between builds, so F-Droid asks for it off
  "android.enablePngCrunchInReleaseBuilds": "false",
  // Every Expo module is built from source here, which needs more than the default memory
  "org.gradle.jvmargs":
    "-Xmx4g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError",
  "kotlin.daemon.jvmargs": "-Xmx3g -XX:MaxMetaspaceSize=1g",
};

/** Sets each property once, replacing any earlier value. */
function setProperties(list, values) {
  const out = list.filter((p) => !(p.key in values));
  for (const [key, value] of Object.entries(values)) {
    out.push({ type: "property", key, value });
  }
  return out;
}

// F-Droid variant: no JitPack and an
// unsigned release APK, because F-Droid signs it.
const withFdroid = (config) => {
  config = withGradleProperties(config, (c) => {
    c.modResults = setProperties(c.modResults, GRADLE_PROPERTIES);
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
module.exports.setProperties = setProperties;
module.exports.GRADLE_PROPERTIES = GRADLE_PROPERTIES;
