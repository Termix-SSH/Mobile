const { withInfoPlist, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const withIOSNetworkSecurity = (config) => {
  config = withInfoPlist(config, (config) => {
    config.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: true,
      NSAllowsArbitraryLoadsInWebContent: true,
      NSAllowsLocalNetworking: true,
      NSAllowsArbitraryLoadsForMedia: true,
      NSExceptionDomains: {
        localhost: {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
      },
    };

    config.modResults.NSLocalNetworkUsageDescription =
      "Termix needs to connect to servers to load hosts and initiate SSH connections";

    config.modResults.NSBonjourServices = ["_ssh._tcp", "_sftp-ssh._tcp"];

    return config;
  });

  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");

      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, "utf8");

        const atsConfig = `
  post_install do |installer|
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'RCT_DEV=1'
      end
    end
  end
`;

        if (!podfileContent.includes("post_install do |installer|")) {
          podfileContent += atsConfig;
          fs.writeFileSync(podfilePath, podfileContent);
        }
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withIOSNetworkSecurity;