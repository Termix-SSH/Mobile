// Keeps every file out of Android backups and phone to phone transfers.
// allowBackup=false is not enough on Android 12+, where device transfer
// ignores it, so each kind of storage is excluded by name.
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DOMAINS = [
  "root",
  "file",
  "database",
  "sharedpref",
  "external",
  "device_root",
  "device_file",
  "device_database",
  "device_sharedpref",
];
const excludes = (indent) =>
  DOMAINS.map((d) => `${indent}<exclude domain="${d}" path="." />`).join("\n");

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
${excludes("        ")}
    </cloud-backup>
    <device-transfer>
${excludes("        ")}
    </device-transfer>
</data-extraction-rules>
`;

// Android 11 and older read this one instead.
const FULL_BACKUP_CONTENT = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${excludes("    ")}
</full-backup-content>
`;

const withNoBackup = (config) => {
  config = withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      config.modResults,
    );
    app.$["android:allowBackup"] = "false";
    app.$["android:fullBackupContent"] = "@xml/termix_backup_rules";
    app.$["android:dataExtractionRules"] = "@xml/termix_data_extraction_rules";
    return config;
  });
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const dir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "termix_data_extraction_rules.xml"),
        DATA_EXTRACTION_RULES,
      );
      fs.writeFileSync(
        path.join(dir, "termix_backup_rules.xml"),
        FULL_BACKUP_CONTENT,
      );
      return config;
    },
  ]);
  return config;
};

module.exports = withNoBackup;
module.exports.DATA_EXTRACTION_RULES = DATA_EXTRACTION_RULES;
module.exports.FULL_BACKUP_CONTENT = FULL_BACKUP_CONTENT;
