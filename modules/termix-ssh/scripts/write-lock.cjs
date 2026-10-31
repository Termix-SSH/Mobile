// Writes engine.lock.json for a release: tag, Rust source hash and the sha256 of each tarball.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { sourceHash } = require("../../../scripts/fetch-ssh-engine.cjs");

const dist = path.resolve(process.argv[2] ?? "dist");
const version = require("../package.json").version;
const assets = {};
for (const name of ["termix-ssh-android.tar.gz", "termix-ssh-ios.tar.gz"]) {
  assets[name] = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(dist, name)))
    .digest("hex");
}
const lock = {
  version,
  tag: `termix-ssh-v${version}`,
  sourceHash: sourceHash(),
  assets,
};
fs.writeFileSync(
  path.join(dist, "engine.lock.json"),
  JSON.stringify(lock, null, 2) + "\n",
);
console.log(JSON.stringify(lock, null, 2));
