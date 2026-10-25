#!/usr/bin/env node
// Run by the F-Droid recipe after npm ci: drops the packages F-Droid cannot take
// (see scripts/fdroid.cjs) from package.json and node_modules.
const fs = require("fs");
const path = require("path");
const { DROPPED_PACKAGES, stripPackageJson } = require("./fdroid.cjs");

const root = path.join(__dirname, "..");
const file = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
fs.writeFileSync(file, JSON.stringify(stripPackageJson(pkg), null, 2) + "\n");
for (const name of DROPPED_PACKAGES) {
  fs.rmSync(path.join(root, "node_modules", name), {
    recursive: true,
    force: true,
  });
}
console.log(`prepare-fdroid: removed ${DROPPED_PACKAGES.join(", ")}`);
