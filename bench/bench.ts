import { appendFileSync } from "node:fs";

// performance.now is rounded in the jest-expo environment.
const now = () => Number(process.hrtime.bigint()) / 1e6;

export type BenchResult = {
  name: string;
  runs: number;
  medianMs: number;
  p95Ms: number;
};

/** Runs fn a few times to warm up, then times each run. */
export function bench(name: string, fn: () => unknown, runs = 30): BenchResult {
  for (let i = 0; i < 3; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = now();
    fn();
    times.push(now() - start);
  }
  times.sort((a, b) => a - b);
  const result = {
    name,
    runs,
    medianMs: round(times[Math.floor(runs / 2)]),
    p95Ms: round(times[Math.min(runs - 1, Math.floor(runs * 0.95))]),
  };
  report(result);
  return result;
}

function round(ms: number): number {
  return Math.round(ms * 100) / 100;
}

function report(result: BenchResult) {
  const line = `${result.name.padEnd(48)} median ${String(result.medianMs).padStart(8)} ms  p95 ${String(result.p95Ms).padStart(8)} ms`;
  process.stdout.write(`${line}\n`);
  const out = process.env.BENCH_OUT;
  if (out) appendFileSync(out, `${JSON.stringify(result)}\n`);
}

/** Same as bench, for async work. */
export async function benchAsync(
  name: string,
  fn: () => Promise<unknown>,
  runs = 10,
): Promise<BenchResult> {
  await fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = now();
    await fn();
    times.push(now() - start);
  }
  times.sort((a, b) => a - b);
  const result = {
    name,
    runs,
    medianMs: round(times[Math.floor(runs / 2)]),
    p95Ms: round(times[Math.min(runs - 1, Math.floor(runs * 0.95))]),
  };
  report(result);
  return result;
}
