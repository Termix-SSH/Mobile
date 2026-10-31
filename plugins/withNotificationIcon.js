const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");
const { NOTIFICATION_DENSITIES, OUT } = require("../scripts/icon-spec.cjs");

// Android status bar icon, used by notifications and background services as
// @drawable/ic_stat_termix. iOS uses the app icon, so nothing to do there.
const RESOURCE = "ic_stat_termix.png";

function copyNotificationIcons(projectRoot, platformProjectRoot) {
  const res = path.join(platformProjectRoot, "app", "src", "main", "res");
  for (const density of Object.keys(NOTIFICATION_DENSITIES)) {
    const src = path.join(
      projectRoot,
      OUT.notificationDir,
      `notification-icon-${density}.png`,
    );
    const dir = path.join(res, `drawable-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, RESOURCE));
  }
}

module.exports = function withNotificationIcon(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      copyNotificationIcons(
        cfg.modRequest.projectRoot,
        cfg.modRequest.platformProjectRoot,
      );
      return cfg;
    },
  ]);
};
module.exports.copyNotificationIcons = copyNotificationIcons;
