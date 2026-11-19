// Writes src/i18n/bundles.ts and an empty file for every language in
// src/i18n/locales/languages.json that has none yet.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n");
const languages = JSON.parse(
  readFileSync(join(root, "locales", "languages.json"), "utf8"),
);

let out =
  "// Made by scripts/i18n-bundles.mjs from locales/languages.json. Do not edit.\n\n" +
  "export const BUNDLES: Record<string, () => Record<string, unknown>> = {\n";
for (const { code, file } of languages) {
  const path = join(root, "locales", "translated", `${file}.json`);
  if (!existsSync(path)) writeFileSync(path, "{}\n");
  out += `  "${code}": () => require("./locales/translated/${file}.json"),\n`;
}
out += "};\n";
writeFileSync(join(root, "bundles.ts"), out);
