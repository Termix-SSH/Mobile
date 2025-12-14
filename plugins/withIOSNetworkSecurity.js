const { withInfoPlist } = require("@expo/config-plugins");

const withIOSNetworkSecurity = (config) => {
  return withInfoPlist(config, (config) => {
    const existingPlist = config.modResults;

    // Configure App Transport Security to allow all HTTP connections
    // This is required for both WebView and native networking (Axios)
    // Users may connect to self-hosted servers via HTTP on any domain/IP
    existingPlist.NSAppTransportSecurity = {
      // Allow all HTTP loads for user-provided servers
      NSAllowsArbitraryLoads: true,
      // Allow local network connections (LAN, Tailscale, etc.)
      NSAllowsLocalNetworking: true,
      // Allow HTTP in WebView content
      NSAllowsArbitraryLoadsInWebContent: true,
      // Allow HTTP for media
      NSAllowsArbitraryLoadsForMedia: true,
    };

    existingPlist.NSLocalNetworkUsageDescription =
      "Termix needs to connect to servers to load hosts and initiate SSH connections";

    existingPlist.NSBonjourServices = ["_ssh._tcp", "_sftp-ssh._tcp"];

    return config;
  });
};

module.exports = withIOSNetworkSecurity;