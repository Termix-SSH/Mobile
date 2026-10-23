// Turns the TXBENCH and TXRESULT lines CI collected into markdown tables.
//
//   node spikes/terminal-view/report.mjs <results dir>
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "results";
const bench = [];
const runs = [];
const sizes = [];

for (const file of readdirSync(dir)) {
  const text = readFileSync(join(dir, file), "utf8");
  for (const line of text.split("\n")) {
    const b = line.match(/TXBENCH (\{.*\})/);
    const r = line.match(/TXRESULT (\{.*\})/);
    const s = line.match(/TXSIZE (\{.*\})/);
    try {
      if (b) bench.push(JSON.parse(b[1]));
      if (r) runs.push(JSON.parse(r[1]));
      if (s) sizes.push(JSON.parse(s[1]));
    } catch {
      // A truncated log line.
    }
  }
}

function table(rows, cols) {
  if (rows.length === 0) return "_none_\n";
  const head = `| ${cols.join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n`;
  return (
    head +
    rows
      .map((r) => `| ${cols.map((c) => r[c] ?? "").join(" | ")} |`)
      .join("\n") +
    "\n"
  );
}

const byKey = (a, b, keys) =>
  keys.reduce((n, k) => n || String(a[k]).localeCompare(String(b[k])), 0);

let out = "## Parser throughput (host)\n\n";
out += table(
  bench.sort((a, b) => byKey(a, b, ["fixture", "engine"])),
  ["fixture", "engine", "mb", "ms", "mbps", "rssMb"],
);

// One row per platform, scenario and engine. Repeats keep the median by uiP95.
const groups = new Map();
for (const r of runs) {
  const k = `${r.platform}|${r.scenario}|${r.engine}`;
  groups.set(k, [...(groups.get(k) ?? []), r]);
}
const merged = [...groups.values()].map((list) => {
  const sorted = [...list].sort((a, b) => a.uiP95 - b.uiP95);
  return { ...sorted[Math.floor(sorted.length / 2)], runs: list.length };
});

out += "\n## Emulator and simulator runs\n\n";
out +=
  "Software rendering on CI machines. Compare engines, not absolute numbers.\n\n";
out += table(
  merged.sort((a, b) => byKey(a, b, ["platform", "scenario", "engine"])),
  [
    "platform",
    "scenario",
    "engine",
    "runs",
    "uiFps",
    "uiP50",
    "uiP95",
    "uiMax",
    "uiDropped",
    "drawP50",
    "drawP95",
    "engineP50",
    "engineP95",
    "mbps",
    "memStartMb",
    "memPeakMb",
  ],
);

for (const s of sizes) {
  const base = sizes.find(
    (b) => b.platform === s.platform && b.variant === "baseline",
  );
  if (base) s.deltaMb = +(s.mb - base.mb).toFixed(2);
}
out += "\n## App size (release, arm64)\n\n";
out += table(
  sizes.sort((a, b) => byKey(a, b, ["platform", "variant"])),
  ["platform", "variant", "mb", "deltaMb"],
);

console.log(out);
