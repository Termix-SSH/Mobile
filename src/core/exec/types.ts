/**
 * Who runs a script on the host.
 * - `plain`: the login user.
 * - `auto`: root when it needs no password, else the login user. Never asks.
 * - `root`: root, through passwordless sudo or the sudo password (may ask).
 */
export type ExecMode = "plain" | "auto" | "root";

export type ExecErrorKind =
  | "timeout"
  | "cancelled"
  /** sudo refused, or the user has no sudo. */
  | "sudo"
  /** The script ran and exited non zero. */
  | "exit"
  /** The connection failed or dropped. */
  | "network";

export class ExecError extends Error {
  constructor(
    readonly kind: ExecErrorKind,
    message: string,
    readonly result?: RunResult,
  ) {
    super(message);
    this.name = "ExecError";
  }
}

export interface RunOptions {
  mode?: ExecMode;
  /** Default 30 s. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Caps stdout and stderr each. Default 4 MiB. */
  maxBytes?: number;
  /** Return the result even when the script exits non zero. */
  allowFail?: boolean;
  /** Shown when asking for the sudo password, like "Restart nginx.service". */
  reason?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  truncated: boolean;
}

export interface StreamHandlers {
  onStdout(data: Uint8Array): void;
  onStderr?(data: Uint8Array): void;
  onExit?(code: number | null): void;
}

/** A running command. Closing it ends the channel, which stops the command. */
export interface StreamHandle {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface ShellHandle extends StreamHandle {
  resize(cols: number, rows: number): Promise<void>;
}

/**
 * Runs scripts on one host over the phone's own SSH connection. A failed
 * login throws the connect error itself; everything after it an ExecError.
 */
export interface ExecRunner {
  readonly hostId: number;
  /** Logs in, or throws the login error. */
  ready(): Promise<void>;
  /** Sends `script` on stdin to `bash -s` and waits for it to end. */
  run(script: string, options?: RunOptions): Promise<RunResult>;
  /**
   * Starts a long command (`journalctl -f`, `docker exec`) and streams its
   * output. `auto` runs it as root when that needs no password.
   */
  stream(
    script: string,
    handlers: StreamHandlers,
    options?: { mode?: "plain" | "auto"; pty?: { cols: number; rows: number } },
  ): Promise<StreamHandle>;
  /** An interactive shell with a terminal, for consoles. */
  shell(
    handlers: { onData(data: Uint8Array): void; onExit?(): void },
    size: { cols: number; rows: number },
  ): Promise<ShellHandle>;
  /** Gives the connection back to the pool. */
  release(): void;
}
