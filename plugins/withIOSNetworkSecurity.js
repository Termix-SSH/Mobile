const { withInfoPlist } = require("@expo/config-plugins");

const withIOSNetworkSecurity = (config) => {
  return withInfoPlist(config, (config) => {
    const existingPlist = config.modResults;

    existingPlist.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: true,
      NSAllowsLocalNetworking: true,
      NSAllowsArbitraryLoadsInWebContent: true,
      NSAllowsArbitraryLoadsForMedia: true,
      NSExceptionDomains: {
        "localhost": {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
        "127.0.0.1": {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
        "0.0.0.0": {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
        "192.168.0.0": {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
        "10.0.0.0": {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
        "172.16.0.0": {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
        "100.64.0.0": {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
        "169.254.0.0": {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
        "fd00::": {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
      },
    };

    existingPlist.NSLocalNetworkUsageDescription =
      "Termix needs to connect to servers on your local network for SSH and other services.";

    existingPlist.NSBonjourServices = ["_ssh._tcp", "_sftp-ssh._tcp"];

    return config;
  });
};

module.exports = withIOSNetworkSecurity;