// Builds the file manager's CodeMirror page into assets/editor/editor.js.html.
// Run `npm run build:editor` after changing scripts/editor/. A test checks
// that the asset was built from the current source.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "scripts/editor/editor.ts");
const out = join(root, "assets/editor/editor.js.html");

export function editorSourceHash() {
  const source = readFileSync(entry, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(source).digest("hex").slice(0, 16);
}

async function main() {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2019", "safari15"],
    write: false,
    legalComments: "none",
  });
  mkdirSync(dirname(out), { recursive: true });
  const code = result.outputFiles[0].text;
  writeFileSync(out, `/* termix-editor ${editorSourceHash()} */\n${code}`);
  console.log(`wrote ${out} (${Math.round(code.length / 1024)} KB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
