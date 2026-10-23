// Writes the byte streams every parser bench reads, from the same fixtures the
// lab screen uses. Node 24 runs this directly (type stripping).
//
//   node spikes/terminal-view/bench/gen-fixtures.mts <out dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  WIDE_SAMPLES,
  altScreenFrame,
  logChunks,
  yesChunk,
} from "../../../src/screens/dev/terminal-lab/fixtures.ts";

const out = process.argv[2] ?? "fixtures";
mkdirSync(out, { recursive: true });

const MB = 1024 * 1024;

function fill(make: (i: number) => string, size: number): Buffer {
  const parts: Buffer[] = [];
  let total = 0;
  for (let i = 0; total < size; i++) {
    const b = Buffer.from(make(i), "utf8");
    parts.push(b);
    total += b.length;
  }
  return Buffer.concat(parts);
}

const files: Record<string, Buffer> = {
  "yes.bin": Buffer.from(yesChunk(32 * MB), "utf8"),
  "log.bin": Buffer.concat(
    Array.from(logChunks(32 * MB, MB), (c) => Buffer.from(c, "utf8")),
  ),
  // A 120x40 TUI redrawing every row, like htop.
  "tui.bin": fill((i) => altScreenFrame(120, 40, i), 16 * MB),
  "wide.bin": fill(
    (i) => `${WIDE_SAMPLES[i % WIDE_SAMPLES.length]} ${i}\r\n`,
    16 * MB,
  ),
};

for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(out, name), data);
  console.log(`${name} ${(data.length / MB).toFixed(1)} MB`);
}
