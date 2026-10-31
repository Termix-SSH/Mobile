import { utf8Encode } from "@termix-ssh/plugin-sdk/host-scripts";
import type { HostSession } from "@/core/transport";

export interface ExecCall {
  command: string;
  stdin: string;
  pty?: { cols: number; rows: number };
  closed: boolean;
}

export type Reply =
  | { stdout?: string; stderr?: string; code?: number | null }
  /** Never answers, for timeouts and aborts. */
  | "hang";

/**
 * A fake SSH session. `reply` sees each command and its stdin (once stdin
 * closes) and says what the host prints.
 */
export function fakeSsh(reply: (call: ExecCall) => Reply = () => ({})) {
  const calls: ExecCall[] = [];
  const disconnects = new Set<() => void>();
  const ssh = {
    execStream: jest.fn(
      async (
        command: string,
        handlers: {
          onStdout(d: Uint8Array): void;
          onStderr?(d: Uint8Array): void;
          onExit?(code: number | null, signal: string | null): void;
        },
        pty?: { cols: number; rows: number },
      ) => {
        const call: ExecCall = { command, stdin: "", pty, closed: false };
        calls.push(call);
        return {
          write: async (data: string | Uint8Array) => {
            call.stdin += typeof data === "string" ? data : String(data);
          },
          eof: async () => {
            const r = reply(call);
            if (r === "hang") return;
            if (r.stdout) handlers.onStdout(utf8Encode(r.stdout));
            if (r.stderr) handlers.onStderr?.(utf8Encode(r.stderr));
            handlers.onExit?.(r.code === undefined ? 0 : r.code, null);
          },
          signal: async () => {},
          close: jest.fn(async () => {
            call.closed = true;
          }),
          release: () => {},
        };
      },
    ),
    openShell: jest.fn(async (_opts: unknown, _handlers: unknown) => ({
      write: jest.fn(async () => {}),
      resize: jest.fn(async () => {}),
      close: jest.fn(async () => {}),
    })),
    onDisconnect: (listener: () => void) => {
      disconnects.add(listener);
      return () => disconnects.delete(listener);
    },
  };
  return {
    ssh,
    calls,
    drop: () => disconnects.forEach((l) => l()),
  };
}

/** A HostSession around a fake ssh. */
export function fakeHostSession(fake: ReturnType<typeof fakeSsh>) {
  const close = jest.fn(async () => {});
  const session = {
    exec: jest.fn(),
    sftp: {} as HostSession["sftp"],
    ssh: fake.ssh as unknown as HostSession["ssh"],
    close,
  } as unknown as HostSession;
  return { session, close };
}
