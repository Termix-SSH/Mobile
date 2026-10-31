import { AppError } from "@/core/errors";
import { SHELL_CWD_COMMAND } from "./shell-cwd";
import type { HostConnectRepository } from "@/core/data/types";
import {
  SshError,
  utf8Decode,
  utf8Encode,
  type SshKbdRequest,
  type SshSession,
  type SshShell,
} from "@/modules/termix-ssh";
import { fromError, type ConnectFailure } from "../errors";
import type {
  HostKeyData,
  ShellChannel,
  ShellDrop,
  ShellExecResult,
  ShellOptions,
} from "../types";
import {
  closeAll,
  openChain,
  type Chain,
  type HopInfo,
  type LoginOverrides,
} from "./chain";
import { classifyKeyboardInteractive, responsesWithAnswer } from "./kbd";
import type { ResolvedLogin } from "./resolve";

/** Splits off a UTF-8 sequence cut at the end of a chunk, so it decodes with the next one. */
export class Utf8Stream {
  private rest = new Uint8Array(0);

  decode(chunk: Uint8Array): string {
    let bytes = chunk;
    if (this.rest.length) {
      bytes = new Uint8Array(this.rest.length + chunk.length);
      bytes.set(this.rest);
      bytes.set(chunk, this.rest.length);
    }
    let cut = bytes.length;
    for (let i = bytes.length - 1; i >= Math.max(0, bytes.length - 3); i--) {
      const b = bytes[i];
      if ((b & 0xc0) === 0x80) continue;
      const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      if (bytes.length - i < need) cut = i;
      break;
    }
    this.rest = bytes.slice(cut);
    return cut ? utf8Decode(bytes.subarray(0, cut)) : "";
  }
}

const BROWSER_URL = /https:\/\/\S+/;

/**
 * A shell opened by this phone's own SSH engine. Mirrors RelayShell's events.
 * A drop is reported once through `onDropped`; the connection reconnects.
 */
export class LocalShell implements ShellChannel {
  private chain: Chain | null = null;
  private shell: SshShell | null = null;
  private abort: AbortController | null = null;
  private overrides: LoginOverrides | null = null;
  private destroyed = false;
  private dropped = false;
  private failed = false;
  private sawData = false;
  private totpAsked = false;
  private cols = 80;
  private rows = 24;
  private pending: {
    hostKey?: (ok: boolean) => void;
    prompt?: (answer: string | null) => void;
  } = {};
  private unsubDrop: (() => void) | null = null;

  constructor(
    private readonly options: ShellOptions,
    private readonly repo: () => HostConnectRepository | undefined,
  ) {}

  private get name() {
    return this.options.hostConfig.name || this.options.hostConfig.ip;
  }

  async connect(cols: number, rows: number): Promise<void> {
    this.cols = cols;
    this.rows = rows;
    await this.open();
  }

  private log(level: string, message: string, stage = "auth") {
    this.options.onConnectionLog?.({ level, stage, message });
  }

  private fail(message: string, failure: ConnectFailure) {
    if (this.failed || this.destroyed) return;
    this.failed = true;
    this.options.onConnectionFailed(`${this.name}: ${message}`, {
      ...failure,
      message,
      origin: "local",
    });
  }

  private askHostKey = (
    scenario: "new" | "changed",
    data: HostKeyData,
  ): Promise<boolean> =>
    new Promise((resolve) => {
      if (this.destroyed || !this.options.onHostKeyVerificationRequired) {
        resolve(false);
        return;
      }
      this.pending.hostKey = resolve;
      this.options.onHostKeyVerificationRequired(scenario, data);
    });

  private ask(prompt: string, isPassword: boolean): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.destroyed) {
        resolve(null);
        return;
      }
      this.pending.prompt = resolve;
      this.options.onTotpRequired(prompt, isPassword);
    });
  }

  private askKbd = async (
    request: SshKbdRequest,
    login: ResolvedLogin,
    hop: HopInfo | null,
  ): Promise<string[] | null> => {
    const { prompts } = request;
    const decision = classifyKeyboardInteractive(prompts, login);
    if (decision.kind === "auto") return decision.responses;
    const prefix = hop
      ? `Jump host ${hop.index + 1}/${hop.total} (${hop.ip}): `
      : "";
    const promptText = (i: number) =>
      [request.instructions.trim(), prompts[i].prompt]
        .filter(Boolean)
        .join("\n");
    let answer: string | null;
    if (decision.kind === "totp") {
      const text = this.totpAsked
        ? "Invalid code, try again:"
        : promptText(decision.promptIndex);
      this.totpAsked = true;
      answer = await this.ask(prefix + text, false);
    } else {
      answer = await this.ask(prefix + promptText(decision.promptIndex), true);
    }
    if (answer == null) return null;
    return responsesWithAnswer(
      prompts,
      decision.promptIndex,
      answer.trim(),
      login.password,
    );
  };

  private onBanner = (banner: string, login: ResolvedLogin) => {
    this.log("info", banner.trim(), "banner");
    // Tailscale check mode asks for a browser visit in the banner.
    const url = login.authType === "tailscale" && banner.match(BROWSER_URL);
    if (url) this.options.onBrowserCheckRequired?.(url[0], banner.trim());
  };

  private async open(): Promise<void> {
    if (this.destroyed) return;
    this.failed = false;
    this.totpAsked = false;
    this.options.onStateChange("connecting", { retryCount: 0 });
    const abort = new AbortController();
    this.abort = abort;
    let chain: Chain;
    try {
      chain = await openChain(
        this.repo(),
        this.options.hostConfig,
        this.overrides,
        {
          askHostKey: this.askHostKey,
          askKbd: this.askKbd,
          onBanner: this.onBanner,
          signal: abort.signal,
          connectTimeoutSecs: this.options.connectTimeoutSecs,
        },
      );
    } catch (err) {
      if (this.destroyed || abort.signal.aborted) return;
      this.handleLoginError(err);
      return;
    }
    if (this.destroyed) {
      closeAll([...chain.hops, chain.target]);
      return;
    }
    this.chain = chain;
    this.options.onBrowserCheckCompleted?.();
    try {
      await this.openShell(chain);
    } catch (err) {
      this.teardown();
      const failure = fromError(err);
      this.fail(failure.message, failure);
      return;
    }
    this.dropped = false;
    // Every shell here is new, so startup lines always run.
    this.options.onStateChange("connected", {
      hostName: this.name,
      fromBackground: false,
      isReattach: false,
    });
    this.options.onPostConnectionSetup();
  }

  private handleLoginError(err: unknown) {
    const e =
      err instanceof SshError || err instanceof AppError
        ? err
        : new AppError(String(err), "UNKNOWN");
    const kind = e instanceof SshError ? e.kind : "app";
    const failure = fromError(e);
    const authType = this.overrides ? "set" : this.options.hostConfig.authType;
    switch (kind) {
      case "passphraseRequired":
      case "badPassphrase":
        if (this.options.onPassphraseRequired) {
          this.options.onPassphraseRequired();
          return;
        }
        break;
      case "authMethodNotAvailable":
        this.options.onAuthDialogNeeded("no_keyboard");
        return;
      case "auth":
        if (authType === "none") {
          this.options.onAuthDialogNeeded("no_keyboard");
          return;
        }
        this.fail(`Authentication failed: ${e.message}`, failure);
        return;
      case "hostKeyRejected":
        this.fail("The host key was not trusted.", failure);
        return;
      case "authCancelled":
      case "cancelled":
        this.fail("Login cancelled.", failure);
        return;
    }
    this.fail(e.message, failure);
  }

  private async openShell(chain: Chain) {
    const decoder = new Utf8Stream();
    this.sawData = false;
    const shell = await chain.target.openShell(
      {
        cols: this.cols,
        rows: this.rows,
        env: { COLORTERM: "truecolor", ...chain.login.env },
        pipeId: this.options.pipeId,
      },
      {
        onData: (bytes) => {
          const text = decoder.decode(bytes);
          if (text) this.options.onData(text);
          this.markData();
        },
        onActive: () => this.markData(),
        onExit: (exitCode, exitSignal) => {
          if (this.destroyed || this.shell !== shell) return;
          this.shell = null;
          // No exit status means the channel was cut, not that the shell ended.
          if (
            exitCode === null &&
            exitSignal === null &&
            (this.dropped || chain.target.isClosed)
          ) {
            this.drop({ kind: "network", reason: "The connection was cut" });
            return;
          }
          if (exitCode === null && exitSignal === null) {
            this.drop({ kind: "ended", reason: "The shell channel closed" });
            return;
          }
          this.teardown();
          this.options.onDisconnected(this.name);
        },
      },
    );
    this.shell = shell;
    this.unsubDrop?.();
    this.unsubDrop = chain.target.onDisconnect((info) => {
      if (info.kind === "local" || this.destroyed || this.chain !== chain)
        return;
      this.drop({ kind: info.kind, reason: info.reason });
    });
  }

  private drop(info: ShellDrop) {
    if (this.dropped && !this.chain) return;
    this.dropped = true;
    this.teardown();
    this.options.onDropped?.(info);
  }

  private markData() {
    if (this.sawData) return;
    this.sawData = true;
    this.options.onStateChange("dataReceived", { hostName: this.name });
  }

  private teardown() {
    this.unsubDrop?.();
    this.unsubDrop = null;
    this.shell?.release();
    this.shell = null;
    if (this.chain) closeAll([...this.chain.hops, this.chain.target]);
    this.chain = null;
  }

  private settlePrompts() {
    this.pending.hostKey?.(false);
    this.pending.prompt?.(null);
    this.pending = {};
  }

  sendInput(data: string): void {
    this.shell?.write(utf8Encode(data)).catch(() => {});
  }

  sendResize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.shell?.resize(cols, rows).catch(() => {});
  }

  sendTotpResponse(code: string): void {
    const resolve = this.pending.prompt;
    this.pending.prompt = undefined;
    resolve?.(code);
  }

  sendHostKeyResponse(action: "accept" | "reject"): void {
    const resolve = this.pending.hostKey;
    this.pending.hostKey = undefined;
    resolve?.(action === "accept");
  }

  sendPassphraseResponse(passphrase: string): void {
    this.overrides = { ...this.overrides, keyPassword: passphrase };
    this.restart();
  }

  sendReconnectWithCredentials(
    credentials: { password?: string; sshKey?: string; keyPassword?: string },
    cols: number,
    rows: number,
  ): void {
    this.cols = cols;
    this.rows = rows;
    this.overrides = {
      password: credentials.password ?? "",
      key: credentials.sshKey ?? "",
      keyPassword: credentials.keyPassword,
    };
    this.restart();
  }

  private restart() {
    this.abort?.abort();
    this.settlePrompts();
    this.teardown();
    this.open();
  }

  // Browser sign-ins only exist through a server.
  sendWarpgateContinue(): void {}

  // The engine keeps its keepalives going on its own threads.
  notifyBackgrounded(): void {}

  notifyForegrounded(): void {}

  async probe(timeoutMs: number): Promise<boolean> {
    const target: SshSession | undefined = this.chain?.target;
    if (!target || target.isClosed || this.dropped) return false;
    try {
      await target.ping(Math.max(1, Math.ceil(timeoutMs / 1000)));
      return true;
    } catch {
      return false;
    }
  }

  async exec(command: string, timeoutSecs = 10): Promise<ShellExecResult> {
    const target = this.chain?.target;
    if (!target || target.isClosed) throw new Error("Not connected");
    const result = await target.exec(command, { timeoutSecs });
    return {
      stdout: utf8Decode(result.stdout),
      exitCode: result.exitCode,
    };
  }

  async getCwd(timeoutMs = 4000): Promise<string | null> {
    try {
      const { stdout, exitCode } = await this.exec(
        SHELL_CWD_COMMAND,
        Math.max(1, Math.ceil(timeoutMs / 1000)),
      );
      const path = stdout.trim().split("\n").pop()?.trim();
      return exitCode === 0 && path?.startsWith("/") ? path : null;
    } catch {
      return null;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort?.abort();
    this.settlePrompts();
    this.shell?.close().catch(() => {});
    this.teardown();
  }
}
