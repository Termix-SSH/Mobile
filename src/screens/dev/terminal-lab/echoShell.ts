import {
  ALT_SCREEN_OFF,
  ALT_SCREEN_ON,
  MOUSE_OFF,
  MOUSE_ON,
  altScreenFrame,
  describeMouseReport,
  testPattern,
} from "./fixtures";

export type ShellAction = "yes" | "log" | null;

export interface ShellResult {
  output: string;
  action: ShellAction;
}

const PROMPT = "\x1b[1;32mlab\x1b[0m$ ";

const HELP =
  "commands: pattern, mouse, alt, yes, log, clear, help\r\n" +
  "Ctrl+C stops yes and log. In alt mode press q to leave.\r\n";

/**
 * A fake shell for the echo source. It echoes keys like a line discipline
 * and runs a few demo commands, so input, mouse and alt screen can be
 * checked with no server.
 */
export class EchoShell {
  private line = "";
  private mouse = false;
  private alt = false;
  private tick = 0;
  cols = 80;
  rows = 24;

  start(): string {
    return testPattern() + HELP + PROMPT;
  }

  get inAltScreen(): boolean {
    return this.alt;
  }

  input(data: string): ShellResult {
    const report = this.mouse ? describeMouseReport(data) : null;
    if (report) {
      return {
        output: this.alt
          ? `\x1b[${this.rows - 1};1H\x1b[K ${report}`
          : `\r\n${report}\r\n${PROMPT}${this.line}`,
        action: null,
      };
    }
    if (this.alt) return { output: this.altInput(data), action: null };

    let output = "";
    let action: ShellAction = null;
    for (const ch of Array.from(data)) {
      if (ch === "\r" || ch === "\n") {
        const result = this.run(this.line.trim());
        this.line = "";
        output += "\r\n" + result.output;
        action = result.action ?? action;
        if (!this.alt && !result.action) output += PROMPT;
      } else if (ch === "\x7f" || ch === "\b") {
        if (this.line.length > 0) {
          this.line = Array.from(this.line).slice(0, -1).join("");
          output += "\b \b";
        }
      } else if (ch === "\x03") {
        this.line = "";
        output += "^C\r\n" + PROMPT;
      } else if (ch === "\x1b") {
        // Arrow keys and other sequences are not echoed.
        break;
      } else if (ch >= " ") {
        this.line += ch;
        output += ch;
      }
    }
    return { output, action };
  }

  /** Called when yes or log stops, to print a fresh prompt. */
  stopped(): string {
    return "\r\n" + PROMPT;
  }

  altFrame(): string {
    this.tick += 1;
    return altScreenFrame(this.cols, this.rows, this.tick);
  }

  private altInput(data: string): string {
    if (data === "q") {
      this.alt = false;
      this.mouse = false;
      return MOUSE_OFF + ALT_SCREEN_OFF + PROMPT;
    }
    return this.altFrame();
  }

  private run(cmd: string): ShellResult {
    switch (cmd) {
      case "":
        return { output: "", action: null };
      case "help":
        return { output: HELP, action: null };
      case "pattern":
        return { output: testPattern(), action: null };
      case "clear":
        return { output: "\x1b[2J\x1b[H", action: null };
      case "mouse":
        this.mouse = !this.mouse;
        return {
          output: this.mouse
            ? MOUSE_ON + "mouse reporting on, tap the terminal\r\n"
            : MOUSE_OFF + "mouse reporting off\r\n",
          action: null,
        };
      case "alt":
        this.alt = true;
        this.mouse = true;
        return {
          output: ALT_SCREEN_ON + MOUSE_ON + this.altFrame(),
          action: null,
        };
      case "yes":
      case "log":
        return { output: "", action: cmd };
      default:
        return { output: `${cmd}: not found\r\n`, action: null };
    }
  }
}
