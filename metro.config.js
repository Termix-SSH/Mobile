const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// store/ is the screenshot tooling with its own node_modules, not app code.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const storeDir = new RegExp(
  `^${escape(path.join(__dirname, "store"))}[/\\\\].*$`,
);
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  storeDir,
];

// The F-Droid build has no expo-notifications; it polls for alerts instead.
if (process.env.TERMIX_FDROID === "1") {
  const resolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, name, platform) =>
    name === "expo-notifications"
      ? { type: "empty" }
      : (resolve ?? context.resolveRequest)(context, name, platform);
}

module.exports = withNativeWind(config, { input: "./global.css" });
