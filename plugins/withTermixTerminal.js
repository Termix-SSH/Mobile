const { withDangerousMod } = require("@expo/config-plugins");

const { fetchGhostty } = require("../scripts/fetch-ghostty.cjs");

// Puts the libghostty binaries in place before Gradle or CocoaPods need them.
const withTermixTerminal = (config) => {
  for (const platform of ["android", "ios"]) {
    config = withDangerousMod(config, [
      platform,
      async (config) => {
        await fetchGhostty(platform);
        return config;
      },
    ]);
  }
  return config;
};

module.exports = withTermixTerminal;
