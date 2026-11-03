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

// expo-camera still references ML Kit and the Play Services scanner as compile only
// classes, so R8 must not fail on them. The app never opens the scanner here.
const PROGUARD_RULES = [
  "-dontwarn com.google.mlkit.**",
  "-dontwarn com.google.android.gms.**",
];

function withProguardRules(entry) {
  const options = entry[1] ?? {};
  const android = options.android ?? {};
  const rules = [android.extraProguardRules, ...PROGUARD_RULES]
    .filter(Boolean)
    .join("\n");
  return [
    entry[0],
    { ...options, android: { ...android, extraProguardRules: rules } },
  ];
}

// F-Droid builds one APK per ABI. Its version code is the app's times ten plus
// the ABI's digit, and the recipe passes it in TERMIX_FDROID_VERCODE.
const ABIS = { 1: "armeabi-v7a", 2: "arm64-v8a", 3: "x86", 4: "x86_64" };

/** Version code and ABI for one F-Droid APK, or the universal APK with no code given. */
function fdroidBuild(version, vercode) {
  const base = versionCode(version);
  if (!vercode) return { versionCode: base, abi: null };
  const code = Number(vercode);
  const abi = ABIS[code % 10];
  if (!abi || Math.floor(code / 10) !== base) {
    throw new Error(`version code ${vercode} does not match ${version}`);
  }
  return { versionCode: code, abi };
}

/** Returns the Expo config for the F-Droid variant. Does not change the input. */
function applyFdroid(config, vercode = process.env.TERMIX_FDROID_VERCODE) {
  const build = fdroidBuild(config.version, vercode);
  // expo-camera's own option leaves out ML Kit and the Play Services scanner
  const plugins = (config.plugins ?? [])
    .filter((p) => !DROPPED_PLUGINS.includes(pluginName(p)))
    .map((p) => {
      if (pluginName(p) === "expo-camera") {
        return [
          "expo-camera",
          { ...(Array.isArray(p) ? p[1] : {}), barcodeScannerEnabled: false },
        ];
      }
      if (pluginName(p) === "expo-build-properties") {
        return withProguardRules(Array.isArray(p) ? p : [p]);
      }
      return p;
    });
  plugins.push(
    build.abi
      ? ["./plugins/withFdroid.js", { abi: build.abi }]
      : "./plugins/withFdroid.js",
  );
  return {
    ...config,
    android: { ...config.android, versionCode: build.versionCode },
    plugins,
    extra: { ...config.extra, distribution: "fdroid" },
  };
}

/**
 * package.json without the packages F-Droid cannot take. Expo ships most modules as
 * prebuilt Maven artifacts that ignore our gradle properties and are binaries, so every
 * module is built from source instead.
 */
function stripPackageJson(pkg) {
  const next = JSON.parse(JSON.stringify(pkg));
  next.expo = next.expo ?? {};
  next.expo.autolinking = {
    ...next.expo.autolinking,
    buildFromSource: [".*"],
  };
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
  ABIS,
  PROGUARD_RULES,
  applyFdroid,
  fdroidBuild,
  findBlocked,
  stripPackageJson,
  versionCode,
};
