// Ported from Plugin-SSH-Terminal src/frontend/terminal/password-prompt.ts
// and its Terminal's maybeOfferPasswordFill, so the phone offers a fill at the
// same prompts and under the same rules as the web terminal.

const PASSWORD_PROMPT =
  /(?:\[sudo\][^\n\r]*:\s*$|sudo:[^\n\r]*password[^\n\r]*required|password for [^\n\r]*:\s*$|Password:\s*$|password:\s*$)/im;

// macOS and BSD sudo only print "Password:", so the command and sudo's retry
// message are what tell it apart from an SSH login prompt.
const SUDO_OUTPUT = /\[sudo\b|sudo:|Sorry, try again/i;
const SUDO_COMMAND = /(?:^|[\s;&|(])sudo(?:\s|$)/;

const ANSI =
  /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|[()#%*+][ -~]|[@-Z\\-_]|\[[0-9:;<=>?!]*[@-~])/g;

export function stripAnsi(output: string): string {
  return output.replace(ANSI, "");
}

export function isPasswordPrompt(output: string): boolean {
  return PASSWORD_PROMPT.test(output);
}

export function isSudoCommand(line: string): boolean {
  return SUDO_COMMAND.test(line);
}

export function isSudoPrompt(output: string, lastCommand: string): boolean {
  return SUDO_OUTPUT.test(output) || isSudoCommand(lastCommand);
}

/** Which saved password a prompt gets: sudo's first for sudo, the login's first otherwise. */
export function pickPassword(
  sudo: boolean,
  saved: { password?: string | null; sudoPassword?: string | null },
): string | null {
  const first = sudo ? saved.sudoPassword : saved.password;
  const second = sudo ? saved.password : saved.sudoPassword;
  return first || second || null;
}

// The plugin waits this long before offering again, or this long after a fill.
export const OFFER_COOLDOWN_MS = 15_000;
export const FILL_COOLDOWN_MS = 3_000;
const BUFFER = 200;

export interface PromptWatcherOptions {
  /** The host's ssh-terminal values. */
  settings: () => {
    passwordPromptAutoFill?: boolean;
    sudoPasswordAutoFill?: boolean;
  };
  /** Whether a password could be filled at all. */
  canFill: () => boolean;
  lastCommand: () => string;
  /** Called when a fill should be offered; call `settle` when it is done. */
  offer: (sudo: boolean) => void;
  now?: () => number;
}

/**
 * Watches terminal output for password prompts. Relay output is fed as it
 * comes; a phone shell reports the prompt line instead, since its output
 * never passes through JS.
 */
export class PromptWatcher {
  private buffer = "";
  private blockedUntil = 0;
  private atPrompt = false;
  private readonly now: () => number;

  constructor(private options: PromptWatcherOptions) {
    this.now = options.now ?? Date.now;
  }

  /** True while the screen ends in a password prompt, so the typed line is never kept. */
  atPasswordPrompt(): boolean {
    return this.atPrompt;
  }

  /** A chunk of output. Prompts can arrive split, so a rolling buffer is matched. */
  feed(output: string): void {
    // Only the end can hold a prompt, so a big chunk is cut before the regex.
    const tail =
      output.length > BUFFER * 4 ? output.slice(-BUFFER * 4) : output;
    this.buffer = (this.buffer + stripAnsi(tail)).slice(-BUFFER);
    this.check();
  }

  /** The line at the prompt, as the native terminal reports it. */
  line(text: string): void {
    this.buffer = stripAnsi(text).slice(-BUFFER);
    this.check();
  }

  /** The offer was answered; a fill waits less before the next offer. */
  settle(filled: boolean): void {
    this.blockedUntil =
      this.now() + (filled ? FILL_COOLDOWN_MS : OFFER_COOLDOWN_MS);
  }

  private check(): void {
    this.atPrompt = isPasswordPrompt(this.buffer);
    if (!this.atPrompt) return;
    const settings = this.options.settings();
    if (settings.passwordPromptAutoFill === false) return;
    const sudo = isSudoPrompt(this.buffer, this.options.lastCommand());
    // Sudo fill is opt in, like the web terminal.
    if (sudo && !settings.sudoPasswordAutoFill) return;
    if (!this.options.canFill() || this.now() < this.blockedUntil) return;
    this.blockedUntil = this.now() + OFFER_COOLDOWN_MS;
    this.buffer = "";
    this.options.offer(sudo);
  }
}
