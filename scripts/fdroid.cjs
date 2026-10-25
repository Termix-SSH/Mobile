// Helpers for the F-Droid build (TERMIX_FDROID=1). app.config.js and
// prepare-fdroid.cjs use them; tests/scripts/fdroid.test.ts covers them.

// Config plugins that download prebuilt binaries or only help development.
const DROPPED_PLUGINS = [
  "expo-dev-client",
  "./plugins/withTermixSsh.js",
  "./plugins/withTermixTerminal.js",
];

// Packages F-Droid cannot take: expo-application pulls the Google install
// referrer library, expo-dev-client is a debug tool.
const DROPPED_PACKAGES = ["expo-application", "expo-dev-client"];

// Dependency groups that must never reach the F-Droid APK.
const BLOCKED_DEPENDENCIES = [
  "com.google.android.gms",
  "com.google.firebase",
  "com.google.mlkit",
  "com.android.installreferrer",
  "com.google.android.play",
];

/** 2.0.0 -> 20000, 2.10.3 -> 21003. Pre release suffixes are ignored. */
function versionCode(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) throw new Error(`bad version: ${version}`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`version too big: ${version}`);
  return major * 10000 + minor * 100 + patch;
}

function pluginName(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

/** Returns the Expo config for the F-Droid variant. Does not change the input. */
function applyFdroid(config) {
  const plugins = (config.plugins ?? []).filter(
    (p) => !DROPPED_PLUGINS.includes(pluginName(p)),
  );
  plugins.push("./plugins/withFdroid.js");
  return {
    ...config,
    android: { ...config.android, versionCode: versionCode(config.version) },
    plugins,
    extra: { ...config.extra, distribution: "fdroid" },
  };
}

/** package.json without the packages F-Droid cannot take. */
function stripPackageJson(pkg) {
  const next = JSON.parse(JSON.stringify(pkg));
  for (const name of DROPPED_PACKAGES) {
    delete next.dependencies?.[name];
    delete next.devDependencies?.[name];
  }
  return next;
}

/** Lines of a gradle dependency report that name a blocked group. */
function findBlocked(report) {
  return report
    .split(/\r?\n/)
    .filter((line) => BLOCKED_DEPENDENCIES.some((g) => line.includes(g)));
}

module.exports = {
  BLOCKED_DEPENDENCIES,
  DROPPED_PACKAGES,
  DROPPED_PLUGINS,
  applyFdroid,
  findBlocked,
  stripPackageJson,
  versionCode,
};
