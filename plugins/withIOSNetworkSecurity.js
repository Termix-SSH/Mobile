const { withInfoPlist, withDangerousMod, IOSConfig } = require("@expo/config-plugins");
const fs = require("fs");

const withIOSNetworkSecurity = (config) => {
  config = withInfoPlist(config, (config) => {
    delete config.modResults.NSAppTransportSecurity;

    config.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: true,
    };

    config.modResults.NSLocalNetworkUsageDescription =
      "Termix needs to connect to servers to load hosts and initiate SSH connections";

    config.modResults.NSBonjourServices = ["_ssh._tcp", "_sftp-ssh._tcp"];

    return config;
  });

  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const { platformProjectRoot } = config.modRequest;

      try {
        let infoPlist = IOSConfig.InfoPlist.read(platformProjectRoot);

        delete infoPlist.NSAppTransportSecurity;

        infoPlist.NSAppTransportSecurity = {
          NSAllowsArbitraryLoads: true,
        };

        IOSConfig.InfoPlist.write(platformProjectRoot, infoPlist);
      } catch (e) {
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withIOSNetworkSecurity;
