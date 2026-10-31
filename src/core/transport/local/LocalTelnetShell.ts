import type { HostConnectRepository } from "@/core/data/types";
import {
  connectTelnet,
  utf8Encode,
  type SshSession,
  type SshShell,
} from "@/modules/termix-ssh";
import { fromError } from "../errors";
import type { HostKeyData, ShellChannel, ShellOptions } from "../types";
import { closeAll, openJumps } from "./chain";
import { autoAnswer } from "./kbd";
import { Utf8Stream } from "./LocalShell";
import { proxiesOf } from "./resolve";

export const TELNET_PORT = 23;

/**
 * A Telnet session the phone opens itself, through the host's jump hosts
 * when it has any. It looks like a shell to the connection and the terminal.
 */
export class LocalTelnetShell implements ShellChannel {
  private shell: SshShell | null = null;
  private hops: SshSession[] = [];
  private abort: AbortController | null = null;
  private destroyed = false;
  private sawData = false;
  private exited = false;
  private cols = 80;
  private rows = 24;
  private pendingHostKey: ((ok: boolean) => void) | null = null;

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

  private askHostKey = (
    scenario: "new" | "changed",
    data: HostKeyData,
  ): Promise<boolean> =>
    new Promise((resolve) => {
      if (this.destroyed || !this.options.onHostKeyVerificationRequired) {
        resolve(false);
        return;
      }
      this.pendingHostKey = resolve;
      this.options.onHostKeyVerificationRequired(scenario, data);
    });

  private async open(): Promise<void> {
    if (this.destroyed) return;
    const host = this.options.hostConfig;
    this.options.onStateChange("connecting", { retryCount: 0 });
    const abort = new AbortController();
    this.abort = abort;
    try {
      const repo = this.repo();
      const profile = host.id > 0 && repo ? await repo.profile(host.id) : null;
      const saved = profile?.host;
      // Jump hosts log in with saved logins only; nobody types for a hop.
      this.hops = await openJumps(
        repo,
        host,
        (host.jumpHosts ?? []).map((j) => j.hostId),
        {
          askHostKey: this.askHostKey,
          askKbd: async (req, login) => autoAnswer(req.prompts, login.password),
          signal: abort.signal,
          connectTimeoutSecs: this.options.connectTimeoutSecs,
        },
      );
      if (this.destroyed) return this.teardown();
      const decoder = new Utf8Stream();
      const shell = await connectTelnet(
        {
          dial: {
            host: host.ip,
            port: saved?.telnetPort || TELNET_PORT,
            proxies: proxiesOf(profile?.socks5),
            connectTimeoutSecs: this.options.connectTimeoutSecs,
          },
          cols: this.cols,
          rows: this.rows,
          username: saved?.telnetUser,
          password: saved?.telnetPassword,
          via: this.hops[this.hops.length - 1],
          pipeId: this.options.pipeId,
        },
        {
          onData: (bytes) => {
            const text = decoder.decode(bytes);
            if (text) this.options.onData(text);
            this.markData();
          },
          onActive: () => this.markData(),
          onExit: (exitCode) => this.ended(exitCode),
        },
      );
      if (this.destroyed) {
        shell.close().catch(() => {});
        return this.teardown();
      }
      // It already ended before the connect call came back.
      if (this.exited) return;
      this.shell = shell;
    } catch (err) {
      this.teardown();
      if (this.destroyed || abort.signal.aborted) return;
      const failure = fromError(err);
      this.options.onConnectionFailed(`${this.name}: ${failure.message}`, {
        ...failure,
        origin: "local",
      });
      return;
    }
    this.options.onStateChange("connected", {
      hostName: this.name,
      fromBackground: false,
      isReattach: false,
    });
    this.options.onPostConnectionSetup();
  }

  // A clean close is the remote logging out; anything else is a drop.
  private ended(exitCode: number | null) {
    if (this.destroyed || this.exited) return;
    this.exited = true;
    this.teardown();
    if (exitCode === null) {
      this.options.onDropped?.({
        kind: "network",
        reason: "The connection was cut",
      });
      return;
    }
    this.options.onDisconnected(this.name);
  }

  private markData() {
    if (this.sawData) return;
    this.sawData = true;
    this.options.onStateChange("dataReceived", { hostName: this.name });
  }

  private teardown() {
    this.shell?.release();
    this.shell = null;
    closeAll(this.hops);
    this.hops = [];
  }

  sendInput(data: string): void {
    this.shell?.write(utf8Encode(data)).catch(() => {});
  }

  sendResize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.shell?.resize(cols, rows).catch(() => {});
  }

  sendHostKeyResponse(action: "accept" | "reject"): void {
    const resolve = this.pendingHostKey;
    this.pendingHostKey = null;
    resolve?.(action === "accept");
  }

  // Telnet logins are typed into the terminal, so these prompts never come up.
  sendTotpResponse(): void {}
  sendPassphraseResponse(): void {}
  sendReconnectWithCredentials(): void {}
  sendWarpgateContinue(): void {}
  notifyBackgrounded(): void {}
  notifyForegrounded(): void {}

  async probe(): Promise<boolean> {
    return !!this.shell && this.hops.every((h) => !h.isClosed);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort?.abort();
    this.pendingHostKey?.(false);
    this.pendingHostKey = null;
    this.shell?.close().catch(() => {});
    this.teardown();
  }
}
