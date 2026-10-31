// Where the plugin host page gets the SDK's frame host and shared modules.
// Used by scripts/build-plugin-host.mjs and the runtime test.

const { existsSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { createRequire } = require("node:module");

const root = join(__dirname, "..");
const appRequire = createRequire(join(root, "package.json"));

// Every shared module resolves from this app, never from the SDK's folder,
// so the page holds one React.
const SHARED = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "i18next",
  "react-i18next",
  "sonner",
];

/** The SDK folder with dist/host/frame-host.js, or null. */
function findSdk() {
  const candidates = [];
  if (process.env.TERMIX_SDK_DIR) {
    candidates.push(resolve(root, process.env.TERMIX_SDK_DIR));
  }
  try {
    candidates.push(
      dirname(appRequire.resolve("@termix-ssh/plugin-sdk/package.json")),
    );
  } catch {
    // Not installed.
  }
  return (
    candidates.find((dir) =>
      existsSync(join(dir, "dist/host/frame-host.js")),
    ) ?? null
  );
}

/** An esbuild plugin that points the page's imports at the SDK and this app. */
function sharedResolver(sdk) {
  const files = {
    "@termix-ssh/plugin-sdk/frontend": join(sdk, "dist/frontend.js"),
    "@termix-ssh/plugin-sdk/ui": join(sdk, "dist/host/ui.js"),
    "@termix-ssh/plugin-sdk/frame-host": join(sdk, "dist/host/frame-host.js"),
    "@termix-ssh/plugin-sdk/frame-host.css": join(
      sdk,
      "dist/host/frame-host.css",
    ),
  };
  return {
    name: "termix-shared",
    setup(build) {
      build.onResolve({ filter: /^@termix-ssh\/plugin-sdk\// }, (args) =>
        files[args.path] ? { path: files[args.path] } : undefined,
      );
      build.onResolve(
        { filter: /^(react|react-dom|i18next|react-i18next|sonner)(\/.*)?$/ },
        (args) =>
          SHARED.includes(args.path)
            ? { path: appRequire.resolve(args.path) }
            : undefined,
      );
    },
  };
}

module.exports = { findSdk, sharedResolver, SHARED };
