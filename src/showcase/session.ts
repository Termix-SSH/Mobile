import { utf8Encode } from "@/modules/termix-ssh";
import type { SshSession, SshSftp } from "@/modules/termix-ssh";
import type { HostSession, TerminalHostConfig } from "@/core/transport/types";
import { motd, prompt, runCommand } from "./shell-output";

const encode = (text: string) => utf8Encode(text);

/** Output for a snippet or command run with no terminal. */
export function commandOutput(command: string, host: string): string {
  const known = runCommand(command, "admin", host);
  if (known !== null) return known.replace(/\x1b\[[0-9;]*m/g, "");
  if (/apt (update|upgrade)/.test(command)) {
    return "Reading package lists... Done\nAll packages are up to date.\n";
  }
  if (command.includes("prune")) return "Total reclaimed space: 1.82GB\n";
  return "done\n";
}

/**
 * A logged in session with no network. Feature backends are swapped for
 * showcase ones, so this only has to log in, run snippets and open consoles.
 */
export function showcaseSession(host: TerminalHostConfig): HostSession {
  const name = host.name || host.ip;
  const ssh = {
    isClosed: false,
    onDisconnect: () => () => {},
    async exec(command: string) {
      return {
        stdout: encode(commandOutput(command, name)),
        stderr: new Uint8Array(0),
        exitCode: 0,
        exitSignal: null,
        truncated: false,
      };
    },
    async execStream(
      command: string,
      handlers: {
        onStdout(data: Uint8Array): void;
        onExit?(code: number | null): void;
      },
    ) {
      let stdin = "";
      const finish = () => {
        handlers.onStdout(encode(commandOutput(`${command}\n${stdin}`, name)));
        handlers.onExit?.(0);
      };
      return {
        write: async (data: string) => {
          stdin += data;
        },
        eof: async () => setTimeout(finish, 50),
        close: async () => {},
        release: () => {},
      };
    },
    async openShell(
      _size: { cols: number; rows: number },
      handlers: { onData(data: Uint8Array): void },
    ) {
      setTimeout(
        () => handlers.onData(encode(motd(name) + prompt("root", name))),
        100,
      );
      return {
        write: async (data: string) => handlers.onData(encode(data)),
        resize: async () => {},
        close: async () => {},
        release: () => {},
      };
    },
    async close() {},
  };
  return {
    exec: (command) => ssh.exec(command),
    sftp: {} as SshSftp,
    ssh: ssh as unknown as SshSession,
    close: async () => {},
  };
}
