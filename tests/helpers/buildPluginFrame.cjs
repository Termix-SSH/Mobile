// Bundles the frame host and turns plugin bundles into CommonJS for the
// runtime test. esbuild can't run inside Jest's jsdom realm, so the test runs
// this in its own Node process: node buildPluginFrame.cjs <out.json> <plugin dirs...>
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const {
  findSdk,
  sharedResolver,
} = require("../../scripts/plugin-host-sdk.cjs");

async function main() {
  const [out, ...plugins] = process.argv.slice(2);
  const workspaceSdk = path.join(
    __dirname,
    "../../../Termix/packages/plugin-sdk",
  );
  const sdk =
    findSdk() ??
    (fs.existsSync(path.join(workspaceSdk, "dist/host/frame-host.js"))
      ? workspaceSdk
      : null);
  if (!sdk) throw new Error("no SDK with the frame host");
  const entry = `
    export * as react from "react";
    export * as reactDom from "react-dom";
    export * as reactDomClient from "react-dom/client";
    export * as jsx from "react/jsx-runtime";
    export * as i18next from "i18next";
    export * as reactI18next from "react-i18next";
    export * as sonner from "sonner";
    export * as frontend from "@termix-ssh/plugin-sdk/frontend";
    export * as ui from "@termix-ssh/plugin-sdk/ui";
    export { startPluginFrame } from "@termix-ssh/plugin-sdk/frame-host";
    export { createNet } from "./net";
  `;
  const result = await esbuild.build({
    stdin: {
      contents: entry,
      resolveDir: path.join(__dirname, "../../scripts/plugin-host"),
      loader: "ts",
    },
    bundle: true,
    format: "cjs",
    platform: "browser",
    jsx: "automatic",
    write: false,
    loader: { ".css": "text" },
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
    plugins: [sharedResolver(sdk)],
  });
  const transformed = {};
  for (const dir of plugins) {
    const code = fs.readFileSync(path.join(dir, "dist/frontend.js"), "utf8");
    transformed[dir] = esbuild.transformSync(code, {
      format: "cjs",
      loader: "js",
    }).code;
  }
  fs.writeFileSync(
    out,
    JSON.stringify({ host: result.outputFiles[0].text, plugins: transformed }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
