import {
  NOT_SUDOER_RE,
  SUDO_REFUSED_RE,
  SUDO_WRONG_RE,
  passwordSudoScript,
  scriptError,
  scriptShell,
  scrub,
  streamCommand,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { HostSession } from "@/core/transport";
import { execPool, type ExecPool } from "./pool";
import { execOnce } from "./run";
import { askSudo, sudoMemory } from "./sudo";
import {
  ExecError,
  type ExecRunner,
  type RunOptions,
  type RunResult,
} from "./types";

export interface RunnerOptions {
  /** Pool key: account and host. */
  key: string;
  hostId: number;
  hostName: string;
  open: () => Promise<HostSession>;
  /** The host's saved sudo password, if any. */
  savedSudoPassword?: () => Promise<string | null | undefined>;
  pool?: ExecPool;
}

const needsPassword = new Set<string>();

/** Test seam. */
export function resetSudoState() {
  needsPassword.clear();
}

const SUDO_HELP =
  "This needs root. Log in as root, set up passwordless sudo, or save a sudo password for the host.";

/** A runner for one host on the shared connection pool. */
export function createRunner(options: RunnerOptions): ExecRunner {
  const pool = options.pool ?? execPool;
  const lease = pool.acquire(options.key, options.open);

  /** Runs on the pooled session, once more on a fresh one if it was stale. */
  async function onSession<T>(fn: (s: HostSession) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const opening = lease.session();
      // Login failures keep their own error, so the caller can say what to fix.
      const session = await opening;
      try {
        return await fn(session);
      } catch (error) {
        if (error instanceof ExecError && error.kind === "network") {
          lease.invalidate(opening);
          if (attempt === 0) continue;
        }
        throw error;
      }
    }
  }

  const once = (command: string, stdin: string, o: RunOptions) =>
    onSession((s) =>
      execOnce(s.ssh, command, stdin, {
        timeoutMs: o.timeoutMs,
        signal: o.signal,
        maxBytes: o.maxBytes,
      }),
    );

  async function asRoot(script: string, o: RunOptions): Promise<RunResult> {
    // Hosts known to want a password skip the passwordless try.
    if (!needsPassword.has(options.key)) {
      const first = await once(scriptShell("root"), script, o);
      if (!SUDO_REFUSED_RE.test(first.stderr)) return first;
      if (NOT_SUDOER_RE.test(first.stderr)) {
        throw new ExecError("sudo", SUDO_HELP);
      }
      needsPassword.add(options.key);
    }

    let password: string | null | undefined =
      sudoMemory.get(options.key) ??
      (await options.savedSudoPassword?.().catch(() => null));
    let fromUser = !password;
    for (let tries = 0; tries < 3; tries++) {
      if (!password) {
        password = await askSudo({
          hostName: options.hostName,
          reason: o.reason,
          retry: tries > 0,
        });
        if (!password) throw new ExecError("cancelled", "Cancelled");
        fromUser = true;
      }
      const { command, stdin } = passwordSudoScript(script, password);
      const result = await once(command, stdin, o);
      if (SUDO_WRONG_RE.test(result.stderr)) {
        sudoMemory.forget(options.key);
        password = null;
        continue;
      }
      if (NOT_SUDOER_RE.test(result.stderr)) {
        throw new ExecError("sudo", SUDO_HELP);
      }
      if (fromUser) sudoMemory.set(options.key, password);
      return result;
    }
    throw new ExecError("sudo", "The sudo password was wrong");
  }

  return {
    hostId: options.hostId,

    async ready() {
      await lease.session();
    },

    async run(script, o = {}) {
      const mode = o.mode ?? "plain";
      const result =
        mode === "root"
          ? await asRoot(script, o)
          : await once(scriptShell(mode), script, o);
      if (result.code !== 0 && result.code !== null && !o.allowFail) {
        if (SUDO_REFUSED_RE.test(result.stderr)) {
          throw new ExecError("sudo", SUDO_HELP, result);
        }
        const own = scriptError(result.stdout);
        throw new ExecError(
          "exit",
          scrub(
            own || result.stderr || result.stdout || "Command failed",
            1500,
          ),
          result,
        );
      }
      return result;
    },

    stream(script, handlers, o = {}) {
      const command = streamCommand(script, o.mode === "auto");
      return onSession(async (s) => {
        try {
          const exec = await s.ssh.execStream(
            command,
            {
              onStdout: handlers.onStdout,
              onStderr: handlers.onStderr,
              onExit: (code) => handlers.onExit?.(code),
            },
            o.pty,
          );
          return {
            write: (data: string) => exec.write(data),
            close: () => exec.close(),
          };
        } catch (error) {
          throw new ExecError(
            "network",
            error instanceof Error ? error.message : String(error),
          );
        }
      });
    },

    shell(handlers, size) {
      return onSession(async (s) => {
        try {
          const shell = await s.ssh.openShell(size, {
            onData: handlers.onData,
            onExit: () => handlers.onExit?.(),
          });
          return {
            write: (data: string) => shell.write(data),
            resize: (cols: number, rows: number) => shell.resize(cols, rows),
            close: () => shell.close(),
          };
        } catch (error) {
          throw new ExecError(
            "network",
            error instanceof Error ? error.message : String(error),
          );
        }
      });
    },

    release: () => lease.release(),
  };
}
