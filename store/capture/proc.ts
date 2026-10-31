import { spawn, spawnSync, type ChildProcess } from "node:child_process";

/** Runs a command and returns stdout. Throws with stderr on failure. */
export function run(cmd: string, args: string[], quiet = false): string {
  const res = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 << 20 });
  if (res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed (${res.status}): ${res.stderr || res.stdout}`,
    );
  }
  if (!quiet && res.stderr?.trim()) process.stderr.write(res.stderr);
  return res.stdout;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A long running command whose output lines can be waited on. */
export class LogWatch {
  private lines: string[] = [];
  private waiters: { re: RegExp; done: (m: RegExpMatchArray) => void }[] = [];
  private proc: ChildProcess;

  constructor(cmd: string, args: string[]) {
    this.proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let rest = "";
    this.proc.stdout?.setEncoding("utf8");
    this.proc.stdout?.on("data", (chunk: string) => {
      const parts = (rest + chunk).split("\n");
      rest = parts.pop() ?? "";
      for (const line of parts) this.push(line);
    });
  }

  private push(line: string) {
    if (!line.includes("SHOWCASE_")) return;
    this.lines.push(line);
    if (process.env.STORE_DEBUG) console.log(`  log: ${line.trim()}`);
    this.waiters = this.waiters.filter((w) => {
      const m = line.match(w.re);
      if (m) w.done(m);
      return !m;
    });
  }

  /** Lines seen so far that matched. */
  matches(re: RegExp): RegExpMatchArray[] {
    return this.lines
      .map((l) => l.match(re))
      .filter((m): m is RegExpMatchArray => !!m);
  }

  clear() {
    this.lines = [];
  }

  wait(re: RegExp, timeoutMs: number): Promise<RegExpMatchArray> {
    const seen = this.lines.map((l) => l.match(re)).find(Boolean);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => {
      const failed = /SHOWCASE_FAILED (.*)/;
      const timer = setTimeout(() => {
        const fail = this.matches(failed).at(-1);
        reject(
          new Error(
            fail ? `App said: ${fail[1]}` : `Timed out waiting for ${re}`,
          ),
        );
      }, timeoutMs);
      this.waiters.push({
        re,
        done: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  stop() {
    this.proc.kill();
  }
}

/** The launch URL the app's ShowcaseHost reads. */
export function showcaseUrl(
  scenario: string,
  opts: { theme?: string; accent?: string; video?: boolean },
): string {
  const q = new URLSearchParams();
  if (opts.theme) q.set("theme", opts.theme);
  if (opts.accent) q.set("accent", opts.accent.replace(/^#/, ""));
  if (opts.video) q.set("video", "1");
  return `termix-mobile://showcase/${scenario}?${q}`;
}
