#!/usr/bin/env node
/**
 * Copies core's frame-core-rules.json (the core requests a plugin view may
 * make) into the app, or with --check <file> fails when the app's copy
 * differs from that file.
 *
 *   node scripts/sync-frame-policy.cjs [--from ../Termix]
 *   node scripts/sync-frame-policy.cjs --check core-rules.json
 */
const fs = require("node:fs");
const path = require("node:path");

const COPY = path.join(
  __dirname,
  "..",
  "src",
  "core",
  "plugins",
  "frame-core-rules.json",
);
const CORE_PATH = path.join(
  "src",
  "ui",
  "plugin-host",
  "frames",
  "frame-core-rules.json",
);

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

function normal(text) {
  return JSON.stringify(JSON.parse(text).rules);
}

const check = arg("check");
if (check) {
  const ours = normal(fs.readFileSync(COPY, "utf8"));
  const theirs = normal(fs.readFileSync(check, "utf8"));
  if (ours !== theirs) {
    console.error(
      "src/core/plugins/frame-core-rules.json differs from core's. Run npm run sync:frame-policy and update bridge-policy tests.",
    );
    process.exit(1);
  }
  console.log("frame-core-rules.json matches core");
  process.exit(0);
}

const from = path.resolve(
  arg("from") ?? path.join(__dirname, "..", "..", "Termix"),
  CORE_PATH,
);
fs.copyFileSync(from, COPY);
console.log(`copied ${from}`);
