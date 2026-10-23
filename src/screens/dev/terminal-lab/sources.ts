// Where the lab's bytes come from. Each source writes base64 to the surface
// and takes the user's input back.
import {
  connect,
  fromBase64,
  isSshEngineAvailable,
  toBase64,
  utf8Decode,
  utf8Encode,
  type SshSession,
  type SshShell,
} from "@/modules/termix-ssh";
import { EchoShell } from "./echoShell";
import { logChunks, yesChunk } from "./fixtures";

export type Write = (base64: string) => void;

export interface LabSource {
  start(write: Write): void | Promise<void>;
  input(base64: string): void;
  resize(cols: number, rows: number): void;
  stop(): void;
  /** Bytes sent to the surface since start. */
  readonly bytes: number;
}

export const b64 = (text: string) => toBase64(utf8Encode(text));

/** A flood of pre-encoded chunks, paced per animation frame. */
export class FloodSource implements LabSource {
  bytes = 0;
  private chunks: { b64: string; len: number }[];
  private i = 0;
  private frame: number | null = null;
  private last = 0;
  private budget = 0;

  /**
   * @param rateMBs target MB/s, 0 for 512 KB every frame
   * @param onCtrlC called when the user presses Ctrl+C
   */
  constructor(
    kind: "yes" | "log",
    private rateMBs: number,
    private onCtrlC?: () => void,
  ) {
    const texts =
      kind === "yes"
        ? [yesChunk(32 * 1024)]
        : Array.from(logChunks(2 * 1024 * 1024, 32 * 1024));
    this.chunks = texts.map((t) => {
      const bytes = utf8Encode(t);
      return { b64: toBase64(bytes), len: bytes.length };
    });
  }

  start(write: Write) {
    this.last = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(100, now - this.last);
      this.last = now;
      this.budget +=
        this.rateMBs > 0
          ? (this.rateMBs * 1024 * 1024 * dt) / 1000
          : 512 * 1024;
      while (this.budget > 0) {
        const c = this.chunks[this.i++ % this.chunks.length];
        write(c.b64);
        this.bytes += c.len;
        this.budget -= c.len;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  input(base64: string) {
    if (utf8Decode(fromBase64(base64)).includes("\x03")) this.onCtrlC?.();
  }

  resize() {}

  stop() {
    if (this.frame != null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

/** The fake shell, plus yes and log on demand and an animated alt screen. */
export class EchoSource implements LabSource {
  private shell = new EchoShell();
  private flood: FloodSource | null = null;
  private altTimer: ReturnType<typeof setInterval> | null = null;
  private write: Write = () => {};
  private sent = 0;

  constructor(private floodRate = 4) {}

  get bytes() {
    return this.sent + (this.flood?.bytes ?? 0);
  }

  private out(text: string) {
    if (!text) return;
    const bytes = utf8Encode(text);
    this.sent += bytes.length;
    this.write(toBase64(bytes));
  }

  start(write: Write) {
    this.write = write;
    this.out(this.shell.start());
  }

  /** Starts the alt screen demo right away, for auto runs. */
  startAlt() {
    this.out(this.shell.input("alt\r").output);
    this.syncAltTimer();
  }

  input(base64: string) {
    const text = utf8Decode(fromBase64(base64));
    if (this.flood) {
      if (text.includes("\x03")) this.stopFlood();
      return;
    }
    const { output, action } = this.shell.input(text);
    this.out(output);
    if (action) {
      this.flood = new FloodSource(action, this.floodRate);
      this.flood.start(this.write);
    }
    this.syncAltTimer();
  }

  private stopFlood() {
    this.flood?.stop();
    this.sent += this.flood?.bytes ?? 0;
    this.flood = null;
    this.out(this.shell.stopped());
  }

  // A full screen redraw at 30 fps, like htop or btop.
  private syncAltTimer() {
    if (this.shell.inAltScreen && !this.altTimer) {
      this.altTimer = setInterval(() => this.out(this.shell.altFrame()), 33);
    } else if (!this.shell.inAltScreen && this.altTimer) {
      clearInterval(this.altTimer);
      this.altTimer = null;
    }
  }

  resize(cols: number, rows: number) {
    this.shell.cols = cols;
    this.shell.rows = rows;
  }

  stop() {
    this.flood?.stop();
    if (this.altTimer) clearInterval(this.altTimer);
    this.altTimer = null;
  }
}

export interface SshTarget {
  host: string;
  port: number;
  username: string;
  password: string;
}

/** A real shell through the A4 engine (modules/termix-ssh). */
export class SshSource implements LabSource {
  bytes = 0;
  private session: SshSession | null = null;
  private shell: SshShell | null = null;
  private size = { cols: 80, rows: 24 };

  constructor(
    private target: SshTarget,
    private onStatus: (text: string) => void,
  ) {}

  async start(write: Write) {
    if (!isSshEngineAvailable) {
      write(b64("The SSH engine is not in this build.\r\n"));
      return;
    }
    const { password } = this.target;
    write(b64(`Connecting to ${this.target.host}...\r\n`));
    try {
      this.session = await connect(
        {
          host: this.target.host,
          port: this.target.port,
          username: this.target.username,
          password,
        },
        {
          // Lab only: accept and print the key instead of asking.
          verifyHostKey: async (key) => {
            write(b64(`Host key ${key.keyType} ${key.sha256}\r\n`));
            return true;
          },
          keyboardInteractive: async (req) => req.prompts.map(() => password),
        },
      );
      this.shell = await this.session.openShell(this.size, {
        onData: (data) => {
          this.bytes += data.length;
          write(toBase64(data));
        },
        onExit: () => this.onStatus("Shell closed"),
      });
      this.session.onDisconnect((reason) => this.onStatus(reason));
    } catch (e) {
      write(b64(`\r\nFailed: ${(e as Error).message}\r\n`));
    }
  }

  input(base64: string) {
    this.shell?.write(fromBase64(base64)).catch(() => {});
  }

  resize(cols: number, rows: number) {
    this.size = { cols, rows };
    this.shell?.resize(cols, rows).catch(() => {});
  }

  stop() {
    this.shell?.close().catch(() => {});
    this.session?.disconnect().catch(() => {});
    this.session = null;
    this.shell = null;
  }
}
