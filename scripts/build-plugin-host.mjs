// Builds the page server plugins run in (scripts/plugin-host/) into
// assets/plugin-host/host.js.html. Run `npm run build:plugin-host` after
// changing scripts/plugin-host/ or updating @termix-ssh/plugin-sdk. A test
// checks that the asset was built from the current source.
//
// The SDK's frame host, UI kit and CSS come from @termix-ssh/plugin-sdk, or
// from a core checkout with TERMIX_SDK_DIR=../Termix/packages/plugin-sdk
// (run `npm run build:sdk` there first).

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "scripts/plugin-host");
const protocol = join(root, "src/core/plugins/frame-protocol.ts");
const out = join(root, "assets/plugin-host/host.js.html");
const apiOut = join(root, "src/core/plugins/host-api.ts");
const { findSdk, sharedResolver } = createRequire(import.meta.url)(
  "./plugin-host-sdk.cjs",
);

/** Hash of the page's own source, so a test can spot a stale asset. */
export function pluginHostSourceHash() {
  const hash = createHash("sha256");
  const files = readdirSync(sourceDir)
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name) => join(sourceDir, name));
  for (const file of [...files, protocol]) {
    hash.update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
  }
  return hash.digest("hex").slice(0, 16);
}

/** PLUGIN_API_VERSION from the SDK's built manifest entry. */
function sdkApiVersion(sdk) {
  const text = readFileSync(join(sdk, "dist/manifest.js"), "utf8");
  const match = text.match(/PLUGIN_API_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/);
  if (!match) throw new Error("No PLUGIN_API_VERSION in the SDK's manifest.js");
  return match[1];
}

async function main() {
  const sdk = findSdk();
  if (!sdk) {
    throw new Error(
      "No SDK with dist/host/frame-host.js (SDK 1.0.22 or newer). Set TERMIX_SDK_DIR " +
        "to a core checkout's packages/plugin-sdk after npm run build:sdk.",
    );
  }
  const result = await build({
    entryPoints: [join(sourceDir, "host.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2022", "safari16.4"],
    platform: "browser",
    jsx: "automatic",
    write: false,
    legalComments: "none",
    loader: { ".css": "text" },
    define: { "process.env.NODE_ENV": '"production"' },
    // ui.js keeps a Vite hot reload hook that is a no-op here.
    logOverride: { "empty-import-meta": "silent" },
    plugins: [sharedResolver(sdk)],
    logLevel: "warning",
  });
  mkdirSync(dirname(out), { recursive: true });
  const code = result.outputFiles[0].text;
  const version = JSON.parse(
    readFileSync(join(sdk, "package.json"), "utf8"),
  ).version;
  const api = sdkApiVersion(sdk);
  writeFileSync(
    out,
    `/* termix-plugin-host ${pluginHostSourceHash()} sdk ${version} api ${api} */\n${code}`,
  );
  writeFileSync(
    apiOut,
    "// Written by scripts/build-plugin-host.mjs, do not edit.\n\n" +
      "/** The plugin API of the SDK the plugin host page was built from. */\n" +
      `export const PLUGIN_HOST_API = "${api}";\n`,
  );
  console.log(`wrote ${out} (${Math.round(code.length / 1024)} KB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
