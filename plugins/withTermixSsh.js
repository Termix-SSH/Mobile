const { withDangerousMod } = require("@expo/config-plugins");

const { fetchEngine } = require("../scripts/fetch-ssh-engine.cjs");

// Puts the prebuilt SSH engine in place before Gradle or CocoaPods need it.
const withTermixSsh = (config) => {
  for (const platform of ["android", "ios"]) {
    config = withDangerousMod(config, [
      platform,
      async (config) => {
        await fetchEngine(platform);
        return config;
      },
    ]);
  }
  return config;
};

module.exports = withTermixSsh;
