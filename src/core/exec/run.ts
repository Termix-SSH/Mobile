import { utf8Decode } from "@termix-ssh/plugin-sdk/host-scripts";
import type { SshSession } from "@/modules/termix-ssh";
import { ExecError, type RunResult } from "./types";

/** The part of an SSH session the exec code needs, so tests can fake it. */
export type ExecSession = Pick<SshSession, "execStream">;

export interface OnceOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  maxBytes?: number;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX = 4 * 1024 * 1024;

class Collector {
  private chunks: Uint8Array[] = [];
  private size = 0;
  truncated = false;

  constructor(private readonly max: number) {}

  add(data: Uint8Array) {
    const room = this.max - this.size;
    if (room <= 0) {
      this.truncated = true;
      return;
    }
    const part = data.length > room ? data.subarray(0, room) : data;
    if (part.length < data.length) this.truncated = true;
    this.chunks.push(part);
    this.size += part.length;
  }

  text(): string {
    const all = new Uint8Array(this.size);
    let at = 0;
    for (const c of this.chunks) {
      all.set(c, at);
      at += c.length;
    }
    return utf8Decode(all);
  }
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Runs one command, writes `stdin` and closes it, and collects the output.
 * A timeout or abort closes the channel, which stops the command.
 */
export function execOnce(
  ssh: ExecSession,
  command: string,
  stdin: string,
  options: OnceOptions = {},
): Promise<RunResult> {
  const max = options.maxBytes ?? DEFAULT_MAX;
  const out = new Collector(max);
  const err = new Collector(max);
  return new Promise<RunResult>((resolve, reject) => {
    let done = false;
    let channel: { close(): Promise<void> } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const stop = (error: ExecError) =>
      finish(() => {
        void channel?.close().catch(() => {});
        reject(error);
      });
    const onAbort = () => stop(new ExecError("cancelled", "Cancelled"));

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort);
    timer = setTimeout(
      () => stop(new ExecError("timeout", "The host took too long to answer")),
      options.timeoutMs ?? DEFAULT_TIMEOUT,
    );

    ssh
      .execStream(command, {
        onStdout: (data) => out.add(data),
        onStderr: (data) => err.add(data),
        onExit: (code) =>
          finish(() =>
            resolve({
              stdout: out.text(),
              stderr: err.text(),
              code,
              truncated: out.truncated || err.truncated,
            }),
          ),
      })
      .then(async (exec) => {
        channel = exec;
        if (done) {
          void exec.close().catch(() => {});
          return;
        }
        if (stdin) await exec.write(stdin);
        await exec.eof();
      })
      .catch((error) =>
        stop(new ExecError("network", messageOf(error) || "Connection lost")),
      );
  });
}
