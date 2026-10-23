// Leaves one candidate engine out of autolinking, for the app size jobs.
//
//   node spikes/terminal-view/scripts/size-variant.mjs baseline|ghostty|native
import { readFileSync, writeFileSync } from "node:fs";

const EXCLUDE = {
  baseline: ["termix-terminal-ghostty", "termix-terminal-native"],
  ghostty: ["termix-terminal-native"],
  native: ["termix-terminal-ghostty"],
};

const variant = process.argv[2];
if (!EXCLUDE[variant]) {
  console.error(`unknown variant ${variant}`);
  process.exit(1);
}
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.expo.autolinking = { ...pkg.expo.autolinking, exclude: EXCLUDE[variant] };
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log(`autolinking excludes ${EXCLUDE[variant].join(", ") || "nothing"}`);
