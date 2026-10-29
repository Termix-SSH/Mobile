import type {
  ShellChannel,
  ShellExecResult,
  ShellOptions,
} from "@/core/transport/types";
import { motd, prompt, runCommand } from "./shell-output";

const open = new Set<ShowcaseShell>();

/** The newest showcase shell, for the video tour to type into. */
export function latestShell(): ShowcaseShell | null {
  let last: ShowcaseShell | null = null;
  for (const s of open) last = s;
  return last;
}

/**
 * Waits for the newest shell to connect. The terminal view can take a few
 * seconds to start on a simulator, and typing before that is lost.
 */
export async function waitForShell(
  timeoutMs = 15000,
): Promise<ShowcaseShell | null> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const shell = latestShell();
    if (shell?.connected) return shell;
    await wait(100);
  }
  return latestShell();
}

/** What a new shell runs first, so a still shot has something on screen. */
let firstCommand: string | null = "fastfetch";

export function setFirstCommand(cmd: string | null) {
  firstCommand = cmd;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A fake shell for store screenshots. It echoes typed keys and answers a
 * handful of commands with canned output. No network.
 */
export class ShowcaseShell implements ShellChannel {
  private line = "";
  private destroyed = false;
  connected = false;
  private readonly user: string;
  private readonly host: string;

  constructor(private readonly options: ShellOptions) {
    this.user = options.hostConfig.username || "admin";
    this.host = options.hostConfig.name || options.hostConfig.ip;
  }

  private get prompt() {
    return prompt(this.user, this.host);
  }

  private emit(text: string) {
    if (!this.destroyed && text) this.options.onData(text);
  }

  async connect(): Promise<void> {
    open.add(this);
    this.options.onStateChange("connecting", { retryCount: 0 });
    await wait(150);
    if (this.destroyed) return;
    this.options.onStateChange("connected", {
      hostName: this.host,
      fromBackground: false,
      isReattach: false,
    });
    this.options.onPostConnectionSetup();
    let out = motd(this.host) + this.prompt;
    if (firstCommand) {
      out += firstCommand + "\r\n" + this.output(firstCommand) + this.prompt;
    }
    this.emit(out);
    this.connected = true;
    this.options.onStateChange("dataReceived", { hostName: this.host });
  }

  private output(cmd: string): string {
    const out = runCommand(cmd, this.user, this.host);
    return out ?? `${cmd.split(" ")[0]}: command not found\r\n`;
  }

  sendInput(data: string): void {
    let out = "";
    for (const ch of Array.from(data)) {
      if (ch === "\r" || ch === "\n") {
        out += "\r\n" + this.output(this.line) + this.prompt;
        this.line = "";
      } else if (ch === "\x7f" || ch === "\b") {
        if (this.line) {
          this.line = Array.from(this.line).slice(0, -1).join("");
          out += "\b \b";
        }
      } else if (ch === "\x03") {
        this.line = "";
        out += "^C\r\n" + this.prompt;
      } else if (ch >= " ") {
        this.line += ch;
        out += ch;
      }
    }
    this.emit(out);
  }

  /** Types a command like a person would, then runs it. */
  async type(cmd: string, gapMs = 70): Promise<void> {
    for (const ch of Array.from(cmd)) {
      if (this.destroyed) return;
      this.sendInput(ch);
      await wait(gapMs + ((ch.charCodeAt(0) * 7) % 40));
    }
    await wait(250);
    this.sendInput("\r");
  }

  async exec(command: string): Promise<ShellExecResult> {
    return {
      stdout: runCommand(command, this.user, this.host) ?? "",
      exitCode: 0,
    };
  }

  async getCwd(): Promise<string | null> {
    return `/home/${this.user}`;
  }

  sendResize(): void {}
  sendTotpResponse(): void {}
  sendHostKeyResponse(): void {}
  sendPassphraseResponse(): void {}
  sendReconnectWithCredentials(): void {}
  sendWarpgateContinue(): void {}
  notifyBackgrounded(): void {}
  notifyForegrounded(): void {}

  async probe(): Promise<boolean> {
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    open.delete(this);
  }
}
