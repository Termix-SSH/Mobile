const { withInfoPlist } = require("@expo/config-plugins");

const withIOSNetworkSecurity = (config) => {
  return withInfoPlist(config, (config) => {
    const existingPlist = config.modResults;

    existingPlist.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: true,
      NSAllowsLocalNetworking: true,
    };

    existingPlist.NSLocalNetworkUsageDescription =
      "Termix needs to connect to servers to load hosts and initiate SSH connections";

    existingPlist.NSBonjourServices = ["_ssh._tcp", "_sftp-ssh._tcp"];

    return config;
  });
};

module.exports = withIOSNetworkSecurity;