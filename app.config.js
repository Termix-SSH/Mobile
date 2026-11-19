const fs = require("fs");
const path = require("path");
const { applyFdroid } = require("./scripts/fdroid.cjs");

// Firebase config for Android push. EAS passes it as a file variable, a local
// build reads google-services.json. Without it the app builds, minus push.
function withFirebase(config) {
  const local = path.join(__dirname, "google-services.json");
  const file =
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync(local) ? "./google-services.json" : null);
  if (!file) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile: file },
  };
}

// app.json is the config. TERMIX_FDROID=1 builds the F-Droid variant.
module.exports = ({ config }) =>
  process.env.TERMIX_FDROID === "1"
    ? applyFdroid(config)
    : withFirebase(config);
