/* eslint-env node */

/**
 * Starts Expo with Metro bound to this machine's Tailscale IP.
 *
 * Metro tells the phone which address to load the bundle from. The default LAN
 * address only works when the phone and this computer share a subnet, which
 * breaks when one is on ethernet and the other on wifi. Tailscale gives both a
 * stable address that works on any network.
 *
 * Run with `npm run start:tailscale`. Ctrl+C stops Expo and Metro.
 */

const { execFileSync, spawn } = require("child_process");

const TAILSCALE_BINARIES = [
  "tailscale",
  "C:\\Program Files\\Tailscale\\tailscale.exe",
];

function tailscaleIp() {
  for (const bin of TAILSCALE_BINARIES) {
    try {
      const out = execFileSync(bin, ["ip", "-4"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const ip = out.trim().split(/\r?\n/)[0].trim();
      if (ip) return ip;
    } catch {
      // not this one, try the next
    }
  }
  return null;
}

const ip = tailscaleIp();

if (!ip) {
  console.error(
    "\nCould not get a Tailscale IP.\n" +
      "Make sure Tailscale is running and signed in, then try again.\n",
  );
  process.exit(1);
}

console.log(`\nExpo Go URL:  exp://${ip}:8081\n`);

// Run the CLI's JS entry with node directly. Going through npx/npx.cmd needs a
// shell on Windows, and that shell swallows Ctrl+C and leaves Metro holding 8081.
const child = spawn(
  process.execPath,
  [require.resolve("expo/bin/cli"), "start", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: ip },
  },
);

// Metro spawns a pool of worker processes. Killing only the CLI can leave those
// workers holding port 8081, which breaks the next run. Take down the tree.
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
    } catch {
      // already gone
    }
  } else {
    child.kill("SIGTERM");
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);

child.on("exit", (code, signal) => {
  process.exit(signal ? 0 : (code ?? 0));
});

child.on("error", (err) => {
  console.error(`\nCould not start Expo: ${err.message}\n`);
  process.exit(1);
});
