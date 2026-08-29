const { withAndroidManifest } = require("expo/config-plugins");

const CALLBACK_SCHEMES = new Set(["termix-mobile", "exp+termix"]);

function restrictOidcCallbackIntentFilters(manifest) {
  const applications = manifest.manifest.application ?? [];
  for (const application of applications) {
    for (const activity of application.activity ?? []) {
      for (const intentFilter of activity["intent-filter"] ?? []) {
        for (const data of intentFilter.data ?? []) {
          const scheme = data.$?.["android:scheme"];
          if (CALLBACK_SCHEMES.has(scheme)) {
            data.$["android:host"] = "oidc-callback";
          }
        }
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
