#!/usr/bin/env node
// Fails when the F-Droid variant would ship a proprietary library.
//
//   node scripts/check-fdroid.cjs                 checks the Expo config and fastlane text
//   node scripts/check-fdroid.cjs <report.txt>    also scans a `gradlew :app:dependencies` report
const fs = require("fs");
const path = require("path");
const { applyFdroid, findBlocked, DROPPED_PLUGINS } = require("./fdroid.cjs");

const root = path.join(__dirname, "..");
const problems = [];

const base = JSON.parse(
  fs.readFileSync(path.join(root, "app.json"), "utf8"),
).expo;
const config = applyFdroid(base);
const names = config.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
for (const dropped of DROPPED_PLUGINS) {
  if (names.includes(dropped))
    problems.push(`plugin still present: ${dropped}`);
}
if (!names.includes("./plugins/withFdroid.js")) {
  problems.push("withFdroid plugin missing");
}

const report = process.argv[2];
if (report) {
  for (const line of findBlocked(fs.readFileSync(report, "utf8"))) {
    problems.push(`blocked dependency: ${line.trim()}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("check-fdroid: ok");
