// Ported from Plugin-SSH-Terminal's useCommandTracker so the phone keeps
// and skips the same commands as the web terminal.

const SENSITIVE_PATTERNS = [
  /\bpassw(or)?d\b/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\bapi.?key\b/i,
  /\bPASS(WORD)?=/i,
  /\bAWS_SECRET/i,
  /\bmysql\b.*-p/i,
  /\bsudo\s+-S\b/,
  /\bhtpasswd\b/i,
  /\bsshpass\b/i,
  /\bcurl\b.*-u\s/i,
  /\bexport\b.*(?:PASSWORD|SECRET|TOKEN|KEY)=/i,
];

/** Lines that look like they hold a secret are never saved. */
export function isSensitiveCommand(command: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(command));
}

type EscapeState = "none" | "esc" | "csi" | "ss3";

function nextEscapeState(state: EscapeState, code: number): EscapeState {
  if (state === "esc") {
    if (code === 91) return "csi";
    if (code === 79) return "ss3";
    return "none";
  }
  if (state === "csi") return code >= 0x40 && code <= 0x7e ? "none" : "csi";
  return "none";
}

export interface TrackerOptions {
  /** A line was submitted; `save` is false for lines that look secret. */
  onSubmit: (line: string, save: boolean) => void;
  /** True while the terminal waits for a password, so the line is dropped. */
  isPasswordInput?: () => boolean;
}

/**
 * Follows what is typed on the current shell line from the bytes sent to
 * the host. It can't see the shell's own editing, so it is a best guess,
 * like the web terminal's.
 */
export class CommandLineTracker {
  private line = "";
  private last = "";
  private escape: EscapeState = "none";
  private listeners = new Set<() => void>();

  constructor(private options: TrackerOptions) {}

  current(): string {
    return this.line;
  }

  /** The last line submitted, kept or not. Tells sudo's bare Password: apart. */
  lastSubmitted(): string {
    return this.last;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.set("");
    this.escape = "none";
  }

  track(data: string): void {
    let next = this.line;
    for (const ch of data) {
      const code = ch.charCodeAt(0);
      if (code === 27) {
        this.escape = "esc";
        continue;
      }
      if (this.escape !== "none") {
        this.escape = nextEscapeState(this.escape, code);
        continue;
      }
      if (code === 13 || code === 10) {
        const command = next.trim();
        next = "";
        if (this.options.isPasswordInput?.()) continue;
        if (command) this.last = command;
        if (command)
          this.options.onSubmit(command, !isSensitiveCommand(command));
        continue;
      }
      if (code === 8 || code === 127) {
        next = next.slice(0, -1);
        continue;
      }
      // Ctrl-C, Ctrl-D and Ctrl-U drop the line.
      if (code === 3 || code === 4 || code === 21) {
        next = "";
        continue;
      }
      if (code >= 32) next += ch;
    }
    this.set(next);
  }

  private set(line: string) {
    if (line === this.line) return;
    this.line = line;
    this.listeners.forEach((l) => l());
  }
}

/** History entries that start with the typed line, newest first. */
export function suggestCommands(
  history: string[],
  line: string,
  limit = 3,
): string[] {
  const typed = line.trimStart();
  if (typed.length < 2) return [];
  const out: string[] = [];
  for (const command of history) {
    if (command.length > typed.length && command.startsWith(typed)) {
      out.push(command);
      if (out.length >= limit) break;
    }
  }
  return out;
}
