const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Newer Xcode rejects pods (including resource bundles) below its minimum target.
const MIN_TARGET = "15.1";
const MARKER = "# termix-pod-deployment-target";

const SNIPPET = `    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${MIN_TARGET}')
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_TARGET}'
        end
      end
    end
`;

const withPodDeploymentTarget = (config) =>
  withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfile = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile",
      );
      let contents = fs.readFileSync(podfile, "utf8");
      if (!contents.includes(MARKER)) {
        const anchor = /post_install do \|installer\|\n/;
        if (!anchor.test(contents)) {
          throw new Error("withPodDeploymentTarget: post_install not found");
        }
        contents = contents.replace(anchor, (m) => m + SNIPPET);
        fs.writeFileSync(podfile, contents);
      }
      return config;
    },
  ]);

module.exports = withPodDeploymentTarget;
