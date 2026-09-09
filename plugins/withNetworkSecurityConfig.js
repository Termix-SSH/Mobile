const {
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>

    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </domain-config>
</network-security-config>
`;

const withNetworkSecurityConfig = (config) => {
  config = withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application[0];

    mainApplication.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";

    return config;
  });

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resXmlPath = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "res",
        "xml",
      );

      if (!fs.existsSync(resXmlPath)) {
        fs.mkdirSync(resXmlPath, { recursive: true });
      }

      const networkSecurityConfigPath = path.join(
        resXmlPath,
        "network_security_config.xml",
      );

      fs.writeFileSync(networkSecurityConfigPath, NETWORK_SECURITY_CONFIG);

      return config;
    },
  ]);

  return config;
};

module.exports = withNetworkSecurityConfig;
module.exports.NETWORK_SECURITY_CONFIG = NETWORK_SECURITY_CONFIG;
