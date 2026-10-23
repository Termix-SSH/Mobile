#!/usr/bin/env node
// Downloads the libghostty binaries pinned in modules/termix-terminal-ghostty/ghostty.lock.json:
// the iOS GhosttyKit.xcframework and the Android libghostty-vt static libraries.
// Prebuild runs this through plugins/withTermixTerminals.js.
//
//   node scripts/fetch-ghostty.cjs [android|ios|all]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { download, sha256File } = require("./fetch-ssh-engine.cjs");

const MODULE = path.join(__dirname, "..", "modules", "termix-terminal-ghostty");
const LOCK = path.join(MODULE, "ghostty.lock.json");

function targets(lock) {
  return {
    android: {
      ...lock["libghostty-vt"].android,
      dest: path.join(MODULE, "android", "vendor"),
      kind: "tar",
    },
    ios: {
      ...lock["libghostty-spm"].xcframework,
      dest: path.join(MODULE, "ios", "vendor", "Frameworks"),
      kind: "zip",
    },
  };
}

function marker(dest) {
  return path.join(dest, ".sha256");
}

async function fetchTarget(t) {
  if (
    fs.existsSync(marker(t.dest)) &&
    fs.readFileSync(marker(t.dest), "utf8").trim() === t.sha256
  ) {
    return;
  }
  const tmp = path.join(os.tmpdir(), `ghostty-${t.sha256}.${t.kind}`);
  console.log(`termix-terminal-ghostty: downloading ${t.url}`);
  await download(t.url, tmp);
  const got = sha256File(tmp);
  if (got !== t.sha256) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`ghostty: ${t.url} sha256 is ${got}, expected ${t.sha256}`);
  }
  fs.rmSync(t.dest, { recursive: true, force: true });
  fs.mkdirSync(t.dest, { recursive: true });
  const rel = path.relative(t.dest, tmp).split(path.sep).join("/");
  if (t.kind === "zip") {
    execFileSync("unzip", ["-q", tmp, "-d", t.dest], { stdio: "inherit" });
  } else {
    execFileSync("tar", ["-xzf", rel], { stdio: "inherit", cwd: t.dest });
  }
  fs.writeFileSync(marker(t.dest), t.sha256 + "\n");
  fs.rmSync(tmp, { force: true });
}

async function fetchGhostty(which = "all") {
  const all = targets(JSON.parse(fs.readFileSync(LOCK, "utf8")));
  const names = which === "all" ? Object.keys(all) : [which];
  for (const n of names) await fetchTarget(all[n]);
}

module.exports = { fetchGhostty };

if (require.main === module) {
  fetchGhostty(process.argv[2] ?? "all").catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
