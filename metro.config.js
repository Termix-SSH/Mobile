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

module.exports = withNativeWind(config, { input: "./global.css" });
