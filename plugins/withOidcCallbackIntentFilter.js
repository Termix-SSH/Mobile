const { withAndroidManifest } = require("expo/config-plugins");

const CALLBACK_SCHEMES = new Set(["termix-mobile", "exp+termix"]);

// Hosts the app scheme is allowed to open. Expo generates a single host-less
// data tag per scheme, which would claim every termix-mobile:// URL; we pin it
// to the hosts we actually route so nothing else can steer the app.
const ALLOWED_HOSTS = ["oidc-callback", "widget"];

function restrictOidcCallbackIntentFilters(manifest) {
  const applications = manifest.manifest.application ?? [];
  for (const application of applications) {
    for (const activity of application.activity ?? []) {
      for (const intentFilter of activity["intent-filter"] ?? []) {
        const data = intentFilter.data ?? [];
        const expanded = [];
        for (const entry of data) {
          const scheme = entry.$?.["android:scheme"];
          if (!CALLBACK_SCHEMES.has(scheme)) {
            expanded.push(entry);
            continue;
          }
          // One data tag per host, otherwise Android pairs the scheme with
          // every host in the filter and only the first one is reachable.
          for (const host of ALLOWED_HOSTS) {
            expanded.push({
              $: { "android:scheme": scheme, "android:host": host },
            });
          }
        }
        if (expanded.length) intentFilter.data = expanded;
      }
    }
  }
  return manifest;
}

module.exports = function withOidcCallbackIntentFilter(config) {
  return withAndroidManifest(config, (androidConfig) => {
    androidConfig.modResults = restrictOidcCallbackIntentFilters(
      androidConfig.modResults,
    );
    return androidConfig;
  });
};

module.exports.restrictOidcCallbackIntentFilters =
  restrictOidcCallbackIntentFilters;
