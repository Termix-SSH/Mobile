const { withInfoPlist } = require("@expo/config-plugins");

const withIOSNetworkSecurity = (config) => {
  return withInfoPlist(config, (config) => {
    config.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: true,
      NSAllowsArbitraryLoadsInWebContent: true,
      NSAllowsLocalNetworking: true,
      NSAllowsArbitraryLoadsForMedia: true,
    };

    config.modResults.NSLocalNetworkUsageDescription =
      "Termix needs to connect to servers to load hosts and initiate SSH connections";

    config.modResults.NSBonjourServices = ["_ssh._tcp", "_sftp-ssh._tcp"];

    return config;
  });
};

module.exports = withIOSNetworkSecurity;