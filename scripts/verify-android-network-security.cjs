/* eslint-env node */
/* global __dirname */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const appJson = require(path.join(projectRoot, "app.json"));
const networkSecurityPlugin = require(
  path.join(projectRoot, "plugins", "withNetworkSecurityConfig.js"),
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const plugins = appJson.expo?.plugins ?? [];
assert(
  plugins.includes("./plugins/withNetworkSecurityConfig.js"),
  "app.json must include ./plugins/withNetworkSecurityConfig.js",
);

const xml = networkSecurityPlugin.NETWORK_SECURITY_CONFIG;
assert(typeof xml === "string", "network security XML must be exported");

const baseConfig = xml.match(/<base-config[\s\S]*?<\/base-config>/)?.[0];
assert(baseConfig, "network security XML must include a base-config");
assert(
  baseConfig.includes('<certificates src="system" />'),
  "base-config must trust Android system CAs",
);
assert(
  baseConfig.includes('<certificates src="user" />'),
  "base-config must trust user-installed CAs",
);

const domainConfig = xml.match(/<domain-config[\s\S]*?<\/domain-config>/)?.[0];
assert(domainConfig, "network security XML must include local domain-config");
assert(
  domainConfig.includes('<certificates src="system" />') &&
    domainConfig.includes('<certificates src="user" />'),
  "local domain-config must keep system and user CA trust anchors",
);

const pluginSource = fs.readFileSync(
  path.join(projectRoot, "plugins", "withNetworkSecurityConfig.js"),
  "utf8",
);
assert(
  pluginSource.includes('"android:networkSecurityConfig"') &&
    pluginSource.includes('"@xml/network_security_config"'),
  "AndroidManifest must reference @xml/network_security_config",
);

console.log("Android network security config trusts system and user CAs.");
