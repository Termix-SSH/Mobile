const {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * withTermixWidgets — wires the home-screen widgets into the native projects.
 *
 * Android needs nothing here: the providers, layouts and receiver entries live
 * in `modules/termix-widgets/android` and reach the app through normal Gradle
 * library-manifest merging.
 *
 * iOS needs a real app-extension target, which this plugin creates on every
 * prebuild:
 *
 *   1. copies the versioned SwiftUI sources into `ios/<target>/`
 *   2. writes the extension's entitlements (App Group membership)
 *   3. adds the App Group to the main app and records its id in Info.plist
 *   4. creates the WidgetKit target, its build phases and build settings, and
 *      embeds the product in the app
 *
 * Options (all optional):
 *   appGroupIdentifier  defaults to `group.<bundleId>.widgets`
 *   targetName          defaults to "TermixWidgets"
 *   deploymentTarget    defaults to "16.0" (see below)
 */

const DEFAULT_TARGET_NAME = "TermixWidgets";
/**
 * The extension targets iOS 16 even though the app supports 15.1: WidgetKit's
 * modern layout APIs (and SwiftUI's `Text.tracking`) require it. An extension
 * may set a higher minimum than its host app — devices below it simply don't
 * offer the widgets.
 */
const DEFAULT_DEPLOYMENT_TARGET = "16.0";
const APP_GROUP_INFO_KEY = "TermixWidgetsAppGroup";
const APP_GROUP_ENTITLEMENT = "com.apple.security.application-groups";
const APP_GROUP_BUILD_SETTING = "TERMIX_WIDGETS_APP_GROUP";

/** Where the widget sources live in the repo. */
const WIDGET_SOURCE_DIR = path.join(
  "modules",
  "termix-widgets",
  "ios",
  "widget",
);

function resolveOptions(config, props = {}) {
  const bundleIdentifier = config.ios?.bundleIdentifier;
  if (!bundleIdentifier) {
    throw new Error(
      "[withTermixWidgets] ios.bundleIdentifier must be set in app.json before the widget target can be created.",
    );
  }

  return {
    targetName: props.targetName || DEFAULT_TARGET_NAME,
    deploymentTarget: props.deploymentTarget || DEFAULT_DEPLOYMENT_TARGET,
    appGroupIdentifier:
      props.appGroupIdentifier || `group.${bundleIdentifier}.widgets`,
    bundleIdentifier,
    widgetBundleIdentifier: `${bundleIdentifier}.widgets`,
  };
}

/** Copies the versioned widget sources into the generated iOS project. */
const withWidgetSources = (config, options) =>
  withDangerousMod(config, [
    "ios",
    async (config) => {
      const { platformProjectRoot, projectRoot } = config.modRequest;
      const sourceDir = path.join(projectRoot, WIDGET_SOURCE_DIR);
      const targetDir = path.join(platformProjectRoot, options.targetName);

      if (!fs.existsSync(sourceDir)) {
        throw new Error(
          `[withTermixWidgets] Widget sources are missing at ${WIDGET_SOURCE_DIR}.`,
        );
      }

      fs.mkdirSync(targetDir, { recursive: true });

      for (const file of fs.readdirSync(sourceDir)) {
        const from = path.join(sourceDir, file);
        if (!fs.statSync(from).isFile()) continue;
        fs.copyFileSync(from, path.join(targetDir, file));
      }

      // The extension's own entitlements: App Group membership is what lets it
      // read the snapshot the app writes.
      const entitlements = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        "<dict>",
        `\t<key>${APP_GROUP_ENTITLEMENT}</key>`,
        "\t<array>",
        `\t\t<string>${options.appGroupIdentifier}</string>`,
        "\t</array>",
        "</dict>",
        "</plist>",
        "",
      ].join("\n");

      fs.writeFileSync(
        path.join(targetDir, `${options.targetName}.entitlements`),
        entitlements,
        "utf8",
      );

      return config;
    },
  ]);

/** Adds the App Group to the main app so it can write the snapshot. */
const withAppGroupEntitlement = (config, options) =>
  withEntitlementsPlist(config, (config) => {
    const existing = config.modResults[APP_GROUP_ENTITLEMENT];
    const groups = Array.isArray(existing) ? existing : [];
    if (!groups.includes(options.appGroupIdentifier)) {
      groups.push(options.appGroupIdentifier);
    }
    config.modResults[APP_GROUP_ENTITLEMENT] = groups;
    return config;
  });

/** Records the App Group id so the native module can find the container. */
const withAppGroupInfoPlist = (config, options) =>
  withInfoPlist(config, (config) => {
    config.modResults[APP_GROUP_INFO_KEY] = options.appGroupIdentifier;
    return config;
  });

/**
 * Creates a PBXBuildFile for a file reference that already exists in a group,
 * so the Sources phase and the navigator share one reference instead of each
 * creating its own (duplicates confuse Xcode's "duplicate output" checks).
 */
function addBuildFileForReference(project, fileRefUuid, basename, phaseName) {
  const buildFileUuid = project.generateUuid();
  const section = project.hash.project.objects.PBXBuildFile;
  section[buildFileUuid] = {
    isa: "PBXBuildFile",
    fileRef: fileRefUuid,
    fileRef_comment: basename,
  };
  section[`${buildFileUuid}_comment`] = `${basename} in ${phaseName}`;
  return { value: buildFileUuid, comment: `${basename} in ${phaseName}` };
}

/** Applies build settings to every configuration of a target. */
function applyBuildSettings(project, target, settings) {
  const configurations = project.pbxXCBuildConfigurationSection();
  const listUuid = target.pbxNativeTarget.buildConfigurationList;
  const lists = project.pbxXCConfigurationList();
  const buildConfigurations = lists[listUuid]?.buildConfigurations ?? [];

  for (const entry of buildConfigurations) {
    const configuration = configurations[entry.value];
    if (!configuration || typeof configuration !== "object") continue;
    configuration.buildSettings = {
      ...configuration.buildSettings,
      ...settings,
    };
  }
}

/** Creates the WidgetKit extension target inside the Xcode project. */
const withWidgetTarget = (config, options) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const { targetName } = options;

    // Prebuild regenerates the project, but a re-run (or `prebuild` without
    // `--clean`) must not create the target twice.
    if (project.pbxTargetByName(targetName)) {
      return config;
    }

    const sourceDir = path.join(
      config.modRequest.projectRoot,
      WIDGET_SOURCE_DIR,
    );
    const swiftFiles = fs
      .readdirSync(sourceDir)
      .filter((file) => file.endsWith(".swift"))
      .sort();

    if (swiftFiles.length === 0) {
      throw new Error(
        "[withTermixWidgets] No Swift sources found for the widget target.",
      );
    }

    const entitlementsFile = `${targetName}.entitlements`;
    const groupFiles = [...swiftFiles, "Info.plist", entitlementsFile];

    // Group: makes the sources visible (and resolvable) under ios/<target>/.
    const group = project.addPbxGroup(groupFiles, targetName, targetName);
    const mainGroup = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(group.uuid, mainGroup);

    // A freshly generated Expo project has no dependency sections; xcode's
    // addTarget silently skips the app → extension dependency when they are
    // missing, which would leave the embed phase racing the extension build.
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency ?? {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy ?? {};

    // Target: also creates the embed phase in the app and the dependency.
    const target = project.addTarget(
      targetName,
      "app_extension",
      targetName,
      options.widgetBundleIdentifier,
    );

    const sourcesPhase = project.addBuildPhase(
      [],
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid,
    );
    project.addBuildPhase(
      [],
      "PBXResourcesBuildPhase",
      "Resources",
      target.uuid,
    );
    project.addBuildPhase(
      [],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      target.uuid,
    );

    // Compile exactly the Swift files, reusing the group's file references.
    const swiftBasenames = new Set(swiftFiles);
    for (const child of group.pbxGroup.children) {
      const basename = String(child.comment ?? "");
      if (!swiftBasenames.has(basename)) continue;
      sourcesPhase.buildPhase.files.push(
        addBuildFileForReference(project, child.value, basename, "Sources"),
      );
    }

    applyBuildSettings(project, target, {
      ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS: "NO",
      CLANG_ENABLE_MODULES: "YES",
      CODE_SIGN_ENTITLEMENTS: `"${targetName}/${entitlementsFile}"`,
      CODE_SIGN_STYLE: "Automatic",
      CURRENT_PROJECT_VERSION: `"${config.ios?.buildNumber ?? "1"}"`,
      GENERATE_INFOPLIST_FILE: "NO",
      INFOPLIST_FILE: `"${targetName}/Info.plist"`,
      IPHONEOS_DEPLOYMENT_TARGET: `"${options.deploymentTarget}"`,
      LD_RUNPATH_SEARCH_PATHS: `"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"`,
      MARKETING_VERSION: `"${config.version ?? "1.0.0"}"`,
      PRODUCT_BUNDLE_IDENTIFIER: `"${options.widgetBundleIdentifier}"`,
      PRODUCT_NAME: `"$(TARGET_NAME)"`,
      SKIP_INSTALL: "YES",
      SWIFT_EMIT_LOC_STRINGS: "YES",
      SWIFT_VERSION: "5.0",
      TARGETED_DEVICE_FAMILY: `"1,2"`,
      // Consumed by the extension's Info.plist so the App Group id is defined
      // in exactly one place.
      [APP_GROUP_BUILD_SETTING]: `"${options.appGroupIdentifier}"`,
    });

    return config;
  });

/**
 * Makes the widget extension signable on EAS.
 *
 * Two problems, both visible in the failing Xcode log
 * ("Signing for \"TermixWidgets\" requires a development team"):
 *
 *  1. No team. EAS only sets DEVELOPMENT_TEAM when `ios.appleTeamId` is in the
 *     app config; without it no target gets a team, so there is nothing to
 *     inherit. We recover it from the provisioning profile EAS installs for the
 *     app target, which always carries the team id.
 *  2. Automatic signing. The target asked Xcode to fetch its own profile for
 *     <bundleId>.widgets, but EAS only registers credentials for the app's
 *     bundle id (see the "Detected provisioning profile mapping" log line) and
 *     no Xcode account is signed in on the builder. Manual signing with an
 *     empty profile lets the extension ride along with the app's signature,
 *     which is what an internal/development build needs.
 *
 * Reading the team at build time keeps the id out of the repo. Setting
 * `ios.appleTeamId` in app.json also works and takes precedence, since Expo's
 * own withDevelopmentTeam then sets the team on every target before this runs.
 */
function findAppleTeamId(project) {
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configurations)) {
    const team = configurations[key]?.buildSettings?.DEVELOPMENT_TEAM;
    if (team) return String(team).replace(/"/g, "");
  }
  return null;
}

/** Reads the team id out of an installed .mobileprovision, if one is present. */
function teamIdFromProvisioningProfile() {
  const home = process.env.HOME;
  if (!home) return null;

  const dir = path.join(
    home,
    "Library",
    "MobileDevice",
    "Provisioning Profiles",
  );
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".mobileprovision"));
  } catch {
    return null;
  }

  for (const file of files) {
    try {
      // A .mobileprovision is CMS-wrapped, but the embedded plist is plain
      // text, so the value can be read without decoding the container.
      const raw = fs.readFileSync(path.join(dir, file), "latin1");
      const match = raw.match(
        /<key>TeamIdentifier<\/key>\s*<array>\s*<string>([^<]+)<\/string>/,
      );
      if (match) return match[1];
    } catch {
      // Unreadable profile — try the next one.
    }
  }
  return null;
}

const withWidgetSigning = (config, options) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const target = project.pbxTargetByName(options.targetName);
    if (!target) return config;

    const team = findAppleTeamId(project) ?? teamIdFromProvisioningProfile();

    applyBuildSettings(
      project,
      { pbxNativeTarget: target },
      {
        // Ride on the app's signature instead of resolving a second profile
        // for the extension's own bundle id, which EAS has not registered.
        CODE_SIGN_STYLE: "Manual",
        PROVISIONING_PROFILE_SPECIFIER: '""',
        ...(team ? { DEVELOPMENT_TEAM: team } : {}),
      },
    );

    return config;
  });

const withTermixWidgets = (config, props = {}) => {
  const options = resolveOptions(config, props);

  config = withAppGroupEntitlement(config, options);
  config = withAppGroupInfoPlist(config, options);
  config = withWidgetSources(config, options);
  config = withWidgetTarget(config, options);
  // Must run after the target exists.
  config = withWidgetSigning(config, options);

  return config;
};

module.exports = withTermixWidgets;
