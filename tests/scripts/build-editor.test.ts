import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "../..");

// Same as editorSourceHash() in scripts/build-editor.mjs.
function sourceHash() {
  const source = fs
    .readFileSync(path.join(root, "scripts/editor/editor.ts"), "utf8")
    .replace(/\r\n/g, "\n");
  return createHash("sha256").update(source).digest("hex").slice(0, 16);
}

test("the editor asset was built from the current source (npm run build:editor)", () => {
  const asset = fs.readFileSync(
    path.join(root, "assets/editor/editor.js.html"),
    "utf8",
  );
  const header = asset.slice(0, asset.indexOf("\n"));
  expect(header).toBe(`/* termix-editor ${sourceHash()} */`);
});

test("the editor page loads nothing from the network", () => {
  const asset = fs.readFileSync(
    path.join(root, "assets/editor/editor.js.html"),
    "utf8",
  );
  expect(asset).not.toMatch(/https?:\/\/[^"'\s]*\.(js|css)\b/);
});
