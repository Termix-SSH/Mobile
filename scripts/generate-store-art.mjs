// Builds the F-Droid icon and feature graphic from assets/brand/logo.svg.
// Run with: npm run store-art
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "fastlane/metadata/android/en-US/images");
const logo = fs.readFileSync(path.join(root, "assets/brand/logo.svg"), "utf8");
const glyph = logo
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");

const BG = "#141513";

function png(markup) {
  return new Resvg(markup, {
    fitTo: { mode: "original" },
    font: { loadSystemFonts: true, defaultFontFamily: "Arial" },
  })
    .render()
    .asPng();
}

fs.mkdirSync(out, { recursive: true });

const icon = new Resvg(
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image href="data:image/png;base64,${fs
    .readFileSync(path.join(root, "assets/images/icon.png"))
    .toString("base64")}" width="512" height="512"/></svg>`,
)
  .render()
  .asPng();
fs.writeFileSync(path.join(out, "icon.png"), icon);

const feature =
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">` +
  `<rect width="1024" height="500" fill="${BG}"/>` +
  `<g transform="translate(80 163) scale(0.32)"><g transform="translate(-227 -244)">${glyph}</g></g>` +
  `<text x="300" y="262" font-size="96" font-weight="700" fill="#ffffff">Termix</text>` +
  `<text x="302" y="322" font-size="30" fill="#8b8d88">Self-hosted, plugin-based server management.</text>` +
  `</svg>`;
fs.writeFileSync(path.join(out, "featureGraphic.png"), png(feature));
console.log("wrote store art");
