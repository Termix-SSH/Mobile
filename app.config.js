const { applyFdroid } = require("./scripts/fdroid.cjs");

// app.json is the config. TERMIX_FDROID=1 builds the F-Droid variant.
module.exports = ({ config }) =>
  process.env.TERMIX_FDROID === "1" ? applyFdroid(config) : config;
