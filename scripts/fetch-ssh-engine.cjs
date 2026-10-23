#!/usr/bin/env node
// Downloads the prebuilt SSH engine (modules/termix-ssh) pinned in engine.lock.json and
// unpacks it where Gradle and CocoaPods look for it. Prebuild runs this through
// plugins/withTermixSsh.js, so EAS builds get it too.
//
//   node scripts/fetch-ssh-engine.cjs [android|ios|all]
//   node scripts/fetch-ssh-engine.cjs --from <dir>   use local build output instead
//   node scripts/fetch-ssh-engine.cjs --hash         print the Rust source hash
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const MODULE = path.join(__dirname, "..", "modules", "termix-ssh");
const LOCK = path.join(MODULE, "engine.lock.json");
const REPO = "Termix-SSH/Mobile";

const TARGETS = {
  android: {
    asset: "termix-ssh-android.tar.gz",
    dest: path.join(MODULE, "android", "src", "main", "jniLibs"),
  },
  ios: {
    asset: "termix-ssh-ios.tar.gz",
    dest: path.join(MODULE, "ios", "TermixSshCore.xcframework"),
  },
};

function listFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? listFiles(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
}

/** Hash of everything that changes the binaries. Line endings are normalized. */
function sourceHash(root = path.join(MODULE, "rust")) {
  const files = [
    path.join(root, "Cargo.toml"),
    path.join(root, "Cargo.lock"),
    ...listFiles(path.join(root, "src")),
  ].sort();
  const h = crypto.createHash("sha256");
  for (const f of files) {
    h.update(path.relative(root, f).split(path.sep).join("/"));
    h.update("\0");
    h.update(fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
    h.update("\0");
  }
  return h.digest("hex");
}

function readLock() {
  return JSON.parse(fs.readFileSync(LOCK, "utf8"));
}

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function download(url, file, redirects = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "termix-mobile" } }, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects === 0) return reject(new Error("too many redirects"));
          return resolve(download(res.headers.location, file, redirects - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`${url} answered ${res.statusCode}`));
        }
        const out = fs.createWriteStream(file);
        res.pipe(out);
        out.on("finish", () => out.close(resolve));
        out.on("error", reject);
      })
      .on("error", reject);
  });
}

function marker(dest) {
  return path.join(dest, ".engine-sha256");
}

function unpack(archive, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  // Relative paths, since GNU tar on Windows reads "C:" as a remote host.
  const rel = path.relative(dest, archive).split(path.sep).join("/");
  execFileSync("tar", ["-xzf", rel], { stdio: "inherit", cwd: dest });
}

async function fetchTarget(name, lock) {
  const t = TARGETS[name];
  const want = lock.assets[t.asset];
  if (!want) throw new Error(`engine.lock.json has no ${t.asset}`);
  if (
    fs.existsSync(marker(t.dest)) &&
    fs.readFileSync(marker(t.dest), "utf8").trim() === want
  ) {
    return;
  }
  const tmp = path.join(os.tmpdir(), `${want}-${t.asset}`);
  const url = `https://github.com/${REPO}/releases/download/${lock.tag}/${t.asset}`;
  console.log(`termix-ssh: downloading ${t.asset} (${lock.tag})`);
  await download(url, tmp);
  const got = sha256File(tmp);
  if (got !== want) {
    fs.rmSync(tmp, { force: true });
    throw new Error(
      `termix-ssh: ${t.asset} sha256 is ${got}, expected ${want}`,
    );
  }
  unpack(tmp, t.dest);
  fs.writeFileSync(marker(t.dest), want + "\n");
  fs.rmSync(tmp, { force: true });
}

/** Copies a local CI build (the same tarballs) into place, skipping the download. */
function useLocal(dir) {
  for (const t of Object.values(TARGETS)) {
    const archive = path.join(dir, t.asset);
    if (!fs.existsSync(archive)) continue;
    unpack(archive, t.dest);
    fs.writeFileSync(marker(t.dest), sha256File(archive) + "\n");
  }
}

async function fetchEngine(which = "all") {
  if (process.env.TERMIX_SSH_ENGINE_DIR)
    return useLocal(process.env.TERMIX_SSH_ENGINE_DIR);
  const lock = readLock();
  const names = which === "all" ? Object.keys(TARGETS) : [which];
  for (const n of names) await fetchTarget(n, lock);
}

module.exports = {
  fetchEngine,
  sourceHash,
  readLock,
  TARGETS,
  download,
  sha256File,
};

if (require.main === module) {
  const arg = process.argv[2] ?? "all";
  if (arg === "--hash") {
    console.log(sourceHash());
  } else if (arg === "--from") {
    useLocal(path.resolve(process.argv[3]));
  } else {
    fetchEngine(arg).catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
  }
}
