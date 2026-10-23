const {
  withDangerousMod,
  withGradleProperties,
} = require("@expo/config-plugins");

const { fetchGhostty } = require("../scripts/fetch-ghostty.cjs");

// Terminal spike: puts the libghostty binaries in place before Gradle or
// CocoaPods need them.
const withTermixTerminals = (config) => {
  for (const platform of ["android", "ios"]) {
    config = withDangerousMod(config, [
      platform,
      async (config) => {
        await fetchGhostty(platform);
        return config;
      },
    ]);
  }
  // libghostty-vt only ships arm64-v8a and x86_64.
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (p) => p.type !== "property" || p.key !== "reactNativeArchitectures",
    );
    config.modResults.push({
      type: "property",
      key: "reactNativeArchitectures",
      value: "arm64-v8a,x86_64",
    });
    return config;
  });
};

module.exports = withTermixTerminals;
