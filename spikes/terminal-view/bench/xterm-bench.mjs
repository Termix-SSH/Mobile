// Parser throughput for xterm.js (headless build of the 5.3 line the app ships).
//
//   npm i --no-save xterm-headless@5.3.0
//   node spikes/terminal-view/bench/xterm-bench.mjs <fixtures dir>
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// xterm-headless 5.3.0 reads window at load in Node.
globalThis.window = globalThis;
const { default: xterm } = await import("xterm-headless");

const dir = process.argv[2] ?? "fixtures";
const CHUNK = 64 * 1024;

function run(data) {
  const term = new xterm.Terminal({
    cols: 120,
    rows: 40,
    scrollback: 10000,
    allowProposedApi: true,
  });
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    for (let i = 0; i < data.length; i += CHUNK) {
      term.write(data.subarray(i, i + CHUNK));
    }
    term.write("", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      term.dispose();
      resolve(ms);
    });
  });
}

for (const name of readdirSync(dir)
  .filter((f) => f.endsWith(".bin"))
  .sort()) {
  const data = readFileSync(join(dir, name));
  await run(data.subarray(0, 1024 * 1024));
  const ms = await run(data);
  const mbps = data.length / 1048576 / (ms / 1000);
  console.log(
    `TXBENCH ${JSON.stringify({
      engine: "xterm",
      fixture: name,
      mb: +(data.length / 1048576).toFixed(1),
      ms: Math.round(ms),
      mbps: +mbps.toFixed(1),
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
    })}`,
  );
}
