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
// Prebuilt Android artifacts that Expo packages carry. The build uses the sources.
const modules = path.join(root, "node_modules");
let removed = 0;
for (const entry of fs.readdirSync(modules)) {
  const dirs = entry.startsWith("@")
    ? fs.readdirSync(path.join(modules, entry)).map((n) => path.join(entry, n))
    : [entry];
  for (const dir of dirs) {
    if (!dir.startsWith("expo") && !dir.startsWith("@expo")) continue;
    for (const sub of ["local-maven-repo", "prebuilds"]) {
      const target = path.join(modules, dir, sub);
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        removed++;
      }
    }
  }
}
console.log(`prepare-fdroid: removed ${removed} prebuilt folders`);
console.log(`prepare-fdroid: removed ${DROPPED_PACKAGES.join(", ")}`);
