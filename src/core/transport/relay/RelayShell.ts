import type { AccountClient } from "@/core/api/AccountClient";
import { fromRelayMessage } from "../errors";
import { BROWSER_SIGN_IN_TITLES } from "../local/auth-support";
import type {
  HostKeyData,
  ShellChannel,
  ShellOptions,
  TerminalHostConfig,
} from "../types";

const TAKEN_OVER = "This session was opened on another device";

/** Shell over the linked server's terminal socket. */
export interface RelayShellConfig extends ShellOptions {
  /** Account the terminal session belongs to. */
  client: Pick<
    AccountClient,
    "serverUrl" | "token" | "terminalWebSocketUrl" | "openSocket"
  >;
  /** Swaps the phone's host id for the server's before connecting. */
  prepareHostConfig?: (
    config: TerminalHostConfig,
  ) => Promise<TerminalHostConfig>;
}

const SIGN_IN_TITLES = BROWSER_SIGN_IN_TITLES;
const SIGN_IN_IDS = Object.keys(SIGN_IN_TITLES);

// Clears the screen and scrollback before a server replays a session.
const CLEAR_FOR_REPLAY = "\x1b[2J\x1b[3J\x1b[H";

const PING_MS = 25000;
const LOW_POWER_PING_MS = 60000;

/**
 * Shell over the linked server's terminal socket. A socket that drops after
 * the shell was up is reported once through `onDropped`; the connection
 * reconnects with a new RelayShell that attaches to the same server session.
 */
export class RelayShell implements ShellChannel {
  private config: RelayShellConfig;
  private ws: WebSocket | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pingMs = PING_MS;
  private shouldNotReconnect = false;
  private hasNotifiedFailure = false;
  private isAppInBackground = false;
  private everConnected = false;
  private dropped = false;
  private probes: ((ok: boolean) => void)[] = [];
  private cwdWaiters: ((path: string | null) => void)[] = [];
  private destroyed = false;
  private cols = 80;
  private rows = 24;
  private wsUrl: string | null = null;
  private wsProtocols: string[] = [];
  private serverSessionId: string | null = null;
  private pendingReattach = false;
  private replayed = false;
  private awaitingAuthCredentials = false;
  // The last error the server sent, so a close after it says why.
  private lastServerError: string | null = null;
  private signInId: string | null = null;

  constructor(config: RelayShellConfig) {
    this.config = config;
    // Seed the backend session id when reviving a backgrounded/cross-device tab.
    if (config.initialSessionId) {
      this.serverSessionId = config.initialSessionId;
    }
  }

  private setServerSessionId(id: string | null) {
    if (this.serverSessionId === id) return;
    this.serverSessionId = id;
    this.config.onSessionIdChange?.(id);
  }

  async connect(cols: number, rows: number): Promise<void> {
    if (this.destroyed) return;

    this.cols = cols;
    this.rows = rows;

    const { client } = this.config;
    const serverUrl = client.serverUrl;
    if (!serverUrl) {
      this.notifyFailureOnce("No server URL found. Link the server again.");
      return;
    }

    const jwtToken = client.token();
    if (!jwtToken || jwtToken.trim() === "") {
      this.notifyFailureOnce("Signed out of this server. Log in again.");
      return;
    }

    this.wsUrl = client.terminalWebSocketUrl(jwtToken);
    this.wsProtocols = [`termix.jwt.${jwtToken}`];
    if (this.config.prepareHostConfig) {
      this.config.hostConfig = await this.config
        .prepareHostConfig(this.config.hostConfig)
        .catch(() => this.config.hostConfig);
      if (this.destroyed) return;
    }

    this.connectWebSocket();
  }

  destroy(): void {
    this.destroyed = true;
    this.shouldNotReconnect = true;
    this.awaitingAuthCredentials = false;
    this.settleProbes(false);
    this.settleCwd(null);
    if (this.signInId) this.sendSignIn(this.signInId, "cancel");
    this.signInId = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "disconnect" }));
      } catch (_) {}
    }
    this.serverSessionId = null;
    this.clearAllTimers();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          this.ws.close(1000, "Component unmounted");
        }
      } catch (_) {}
      this.ws = null;
    }
  }

  sendInput(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "input", data }));
      } catch (e) {}
    }
  }

  attachTmux(sessionName: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({ type: "tmux_attach", data: { sessionName } }),
        );
      } catch (e) {}
    }
  }

  sendResize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "resize", data: { cols, rows } }));
      } catch (e) {}
    }
  }

  sendTotpResponse(code: string, isPassword: boolean): void {
    const responseType = isPassword ? "password_response" : "totp_response";
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: responseType, data: { code } }));
      } catch (e) {}
    }
  }

  sendHostKeyResponse(action: "accept" | "reject"): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: "host_key_verification_response",
            data: { action },
          }),
        );
      } catch (e) {}
    }
  }

  sendReconnectWithCredentials(
    credentials: { password?: string; sshKey?: string; keyPassword?: string },
    cols: number,
    rows: number,
  ): void {
    this.cols = cols;
    this.rows = rows;
    const updatedHostConfig: TerminalHostConfig = {
      ...this.config.hostConfig,
      password: credentials.password,
      key: credentials.sshKey,
      keyPassword: credentials.keyPassword,
      authType: (credentials.password ? "password" : "key") as
        "password" | "key",
    };

    this.config.hostConfig = updatedHostConfig;
    this.awaitingAuthCredentials = false;
    this.shouldNotReconnect = false;
    this.hasNotifiedFailure = false;

    const messageData = {
      password: credentials.password,
      sshKey: credentials.sshKey,
      keyPassword: credentials.keyPassword,
      hostConfig: updatedHostConfig,
      cols,
      rows,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: "reconnect_with_credentials",
            data: messageData,
          }),
        );
      } catch (e) {}
      return;
    }

    // Clear any pending connection timeout before starting a new connect to
    // prevent the old timer from closing the newly-created socket.
    this.clearAllTimers();
    this.connectWebSocket();
  }

  // Which sign-in handler asked for the browser round. 2.9 names it per
  // handler, older servers only had warpgate.
  private browserSignInId = "warpgate";

  private sendSignIn(id: string, suffix: string, extra: object = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(
        JSON.stringify({
          type: `${id}_${suffix}`,
          data: { hostId: this.config.hostConfig.id, ...extra },
        }),
      );
    } catch (_) {}
  }

  // The server runs these sign-ins. The app starts one, shows the browser
  // page and tells the server when the page is done.
  private handleSignIn(msg: Record<string, any>): boolean {
    const type = msg.type;
    if (typeof type !== "string") return false;
    const id = SIGN_IN_IDS.find((i) => type.startsWith(`${i}_`));
    if (!id) return false;
    const event = type.slice(id.length + 1);
    const title = SIGN_IN_TITLES[id];
    const done = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
    };
    const fail = (fallback: string) => {
      done();
      this.signInId = null;
      this.shouldNotReconnect = true;
      this.notifyFailureOnce(
        (msg.error as string) || (msg.message as string) || fallback,
      );
    };

    switch (event) {
      case "auth_required":
        if (msg.url) return false;
        done();
        this.signInId = id;
        this.sendSignIn(id, "start_auth");
        return true;
      case "status":
      case "auth_url":
        if (!msg.url) return true;
        done();
        this.signInId = id;
        this.config.onBrowserCheckRequired?.(
          msg.url as string,
          `Sign in with ${title} in your browser. This closes when it is done.`,
          `${title} sign in`,
        );
        return true;
      case "completed":
        done();
        this.config.onBrowserCheckCompleted?.();
        this.sendSignIn(id, "auth_completed", {
          cols: this.cols,
          rows: this.rows,
          hostConfig: this.config.hostConfig,
        });
        this.signInId = null;
        return true;
      case "error":
        fail(`${title} sign in failed`);
        return true;
      case "config_error":
        fail(`${title} is not set up on the server`);
        return true;
      case "timeout":
        fail(`${title} sign in timed out`);
        return true;
    }
    return false;
  }

  sendWarpgateContinue(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: `${this.browserSignInId}_auth_continue`,
            data: {},
          }),
        );
      } catch (_) {}
    }
  }

  sendPassphraseResponse(passphrase: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: "reconnect_with_credentials",
            data: {
              keyPassword: passphrase,
              hostConfig: {
                ...this.config.hostConfig,
                keyPassword: passphrase,
              },
              cols: this.cols,
              rows: this.rows,
            },
          }),
        );
      } catch (_) {}
    }
  }

  // The OS answers the server's socket pings, so our own pings can rest.
  notifyBackgrounded(): void {
    this.isAppInBackground = true;
    this.stopPingInterval();
  }

  notifyForegrounded(): void {
    const wasInBackground = this.isAppInBackground;
    this.isAppInBackground = false;
    if (!wasInBackground || this.destroyed) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.startPingInterval();
      return;
    }
    if (this.everConnected) {
      this.drop("The socket closed while the app was away");
    }
  }

  /** Sends a ping and waits for the server to say anything back. */
  probe(timeoutMs: number): Promise<boolean> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || this.destroyed) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.probes = this.probes.filter((p) => p !== done);
        resolve(false);
      }, timeoutMs);
      const done = (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok);
      };
      this.probes.push(done);
      try {
        ws.send(JSON.stringify({ type: "ping" }));
      } catch (_) {
        this.settleProbes(false);
      }
    });
  }

  /** Asks the server for the shell's working directory. Null after `timeoutMs`. */
  getCwd(timeoutMs = 4000): Promise<string | null> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || this.destroyed) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.cwdWaiters = this.cwdWaiters.filter((w) => w !== done);
        resolve(null);
      }, timeoutMs);
      const done = (path: string | null) => {
        clearTimeout(timer);
        resolve(path);
      };
      this.cwdWaiters.push(done);
      try {
        ws.send(JSON.stringify({ type: "get_cwd" }));
      } catch (_) {
        this.settleCwd(null);
      }
    });
  }

  private settleCwd(path: string | null) {
    const waiting = this.cwdWaiters;
    this.cwdWaiters = [];
    waiting.forEach((w) => w(path));
  }

  private settleProbes(ok: boolean) {
    const waiting = this.probes;
    this.probes = [];
    waiting.forEach((p) => p(ok));
  }

  setLowPower(on: boolean): void {
    const next = on ? LOW_POWER_PING_MS : PING_MS;
    if (next === this.pingMs) return;
    this.pingMs = next;
    if (this.pingInterval) this.startPingInterval();
  }

  private drop(reason: string, kind: "network" | "server" = "network") {
    if (this.dropped || this.destroyed) return;
    this.dropped = true;
    this.clearAllTimers();
    this.settleProbes(false);
    this.config.onDropped?.({ kind, reason });
  }

  private connectWebSocket(): void {
    if (this.destroyed) return;

    if (!this.wsUrl) {
      this.notifyFailureOnce(
        "No WebSocket URL available - server not configured",
      );
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        if (
          this.ws.readyState === WebSocket.CONNECTING ||
          this.ws.readyState === WebSocket.OPEN
        ) {
          this.ws.close();
        }
      } catch (_) {}
    }

    this.config.onStateChange("connecting", { retryCount: 0 });

    const ws = this.config.client.openSocket(
      this.wsUrl,
      this.wsProtocols,
    ) as WebSocket;
    this.ws = ws;

    this.connectionTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.onclose = null;
          ws.close();
        } catch (_) {}
        this.notifyFailureOnce("Connection timeout - server not responding");
      }
    }, 10000);

    ws.onopen = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      this.hasNotifiedFailure = false;

      if (this.serverSessionId) {
        this.pendingReattach = true;
        this.replayed = false;
        // The server replays the screen before "connected", so clear first.
        this.config.onData(CLEAR_FOR_REPLAY);
        ws.send(
          JSON.stringify({
            type: "attachSession",
            data: {
              sessionId: this.serverSessionId,
              cols: this.cols,
              rows: this.rows,
              tabInstanceId: this.config.tabInstanceId,
            },
          }),
        );
      } else {
        ws.send(
          JSON.stringify({
            type: "connectToHost",
            data: {
              cols: this.cols,
              rows: this.rows,
              hostConfig: this.config.hostConfig,
              tabInstanceId: this.config.tabInstanceId,
            },
          }),
        );
      }

      this.startPingInterval();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this.destroyed) return;
      // Anything from the server answers a probe.
      if (this.probes.length) this.settleProbes(true);
      try {
        const msg = JSON.parse(event.data as string);

        if (
          typeof msg.type === "string" &&
          msg.type.endsWith("_check_required")
        ) {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          this.config.onBrowserCheckRequired?.(
            (msg.url as string) || "",
            (msg.message as string) || "",
          );
        } else if (
          typeof msg.type === "string" &&
          msg.type.endsWith("_check_completed")
        ) {
          this.config.onBrowserCheckCompleted?.();
        } else if (msg.type === "data") {
          if (this.pendingReattach) this.replayed = true;
          this.config.onData(msg.data as string);
          this.config.onStateChange("dataReceived", {
            hostName: this.config.hostConfig.name,
          });
        } else if (msg.type === "totp_required") {
          this.config.onTotpRequired(
            (msg.prompt as string) || "Verification code:",
            false,
          );
        } else if (msg.type === "password_required") {
          this.awaitingAuthCredentials = true;
          this.shouldNotReconnect = true;
          this.config.onTotpRequired(
            (msg.prompt as string) || "Password:",
            true,
          );
        } else if (
          msg.type === "keyboard_interactive_available" ||
          msg.type === "auth_method_not_available"
        ) {
          this.awaitingAuthCredentials = true;
          this.shouldNotReconnect = true;
          this.config.onAuthDialogNeeded("no_keyboard");
        } else if (msg.type === "host_key_verification_required") {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          if (this.config.onHostKeyVerificationRequired) {
            this.config.onHostKeyVerificationRequired(
              "new",
              msg.data as HostKeyData,
            );
          } else {
            this.shouldNotReconnect = true;
            this.notifyFailureOnce(
              "Host key verification required but no handler is registered",
            );
          }
        } else if (msg.type === "host_key_changed") {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          if (this.config.onHostKeyVerificationRequired) {
            this.config.onHostKeyVerificationRequired(
              "changed",
              msg.data as HostKeyData,
            );
          } else {
            this.shouldNotReconnect = true;
            this.notifyFailureOnce(
              "Host key changed but no handler is registered",
            );
          }
        } else if (msg.type === "passphrase_required") {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          this.config.onPassphraseRequired?.();
        } else if (this.handleSignIn(msg)) {
          // opkssh, vault and step-ca browser sign-ins
        } else if (
          typeof msg.type === "string" &&
          msg.type.endsWith("_auth_required")
        ) {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          if (msg.url) {
            this.browserSignInId = msg.type.slice(0, -"_auth_required".length);
            this.config.onWarpgateAuthRequired?.(
              (msg.url as string) || "",
              (msg.securityKey as string) || "",
            );
          } else {
            // Sign-ins started from the app side (opkssh and the like).
            this.shouldNotReconnect = true;
            this.notifyFailureOnce(
              (msg.message as string) ||
                "This host needs a sign-in that only the web app supports",
            );
          }
        } else if (msg.type === "totp_retry") {
          this.config.onTotpRequired("Invalid code, try again:", false);
        } else if (msg.type === "session_ended") {
          this.setServerSessionId(null);
          this.config.onDisconnected(this.config.hostConfig.name);
        } else if (msg.type === "error") {
          const message = (msg.message as string) || "Unknown error";
          if (
            this.config.hostConfig.authType === "none" &&
            this.isAuthenticationError(message)
          ) {
            this.awaitingAuthCredentials = true;
            this.shouldNotReconnect = true;
            this.config.onAuthDialogNeeded("no_keyboard");
            return;
          }

          this.lastServerError = message;
          if (this.isUnrecoverableError(message)) {
            this.shouldNotReconnect = true;
            this.notifyFailureOnce("Authentication failed: " + message);
            try {
              ws.close(1000);
            } catch (_) {}
            return;
          }
        } else if (msg.type === "connected") {
          this.lastServerError = null;
          this.everConnected = true;
          const isReattach = this.pendingReattach;
          this.pendingReattach = false;
          this.config.onStateChange("connected", {
            hostName: this.config.hostConfig.name,
            fromBackground: false,
            isReattach,
          });
          // The replay came before "connected", so count it as shown data.
          if (isReattach && this.replayed) {
            this.replayed = false;
            this.config.onStateChange("dataReceived", {
              hostName: this.config.hostConfig.name,
            });
          }
          if (!isReattach) this.config.onPostConnectionSetup();
        } else if (msg.type === "disconnected") {
          this.setServerSessionId(null);
          this.config.onDisconnected(this.config.hostConfig.name);
        } else if (msg.type === "cwd") {
          const waiter = this.cwdWaiters.shift();
          waiter?.(typeof msg.path === "string" && msg.path ? msg.path : null);
        } else if (msg.type === "resized" || msg.type === "pong") {
        } else if (msg.type === "sessionCreated") {
          this.setServerSessionId(msg.sessionId as string);
        } else if (msg.type === "sessionAttached") {
          this.setServerSessionId(msg.sessionId as string);
        } else if (msg.type === "sessionExpired") {
          this.setServerSessionId(null);
          this.pendingReattach = false;
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(
              JSON.stringify({
                type: "connectToHost",
                data: {
                  cols: this.cols,
                  rows: this.rows,
                  hostConfig: this.config.hostConfig,
                  tabInstanceId: this.config.tabInstanceId,
                },
              }),
            );
          }
        } else if (msg.type === "sessionTakenOver") {
          // Keep the session id: Retry takes the session back here.
          this.shouldNotReconnect = true;
          this.notifyFailureOnce(TAKEN_OVER, true);
        } else if (msg.type === "tmux_sessions_available") {
          const list = Array.isArray(msg.sessions) ? msg.sessions : [];
          this.config.onTmuxSessions?.(
            list
              .filter((s: any) => typeof s?.name === "string")
              .map((s: any) => ({
                name: s.name,
                windows: Number(s.windows) || undefined,
                attachedClients: Number(s.attachedClients) || 0,
                lastActivity: Number(s.lastActivity) || 0,
              })),
          );
        } else if (msg.type === "tmux_unavailable") {
          this.config.onConnectionLog?.({
            level: "warning",
            stage: "tmux",
            message:
              "tmux is not installed on this host. Using the plain shell.",
          });
        } else if (msg.type === "connection_log") {
          if (msg.data) {
            this.config.onConnectionLog?.(
              msg.data as { level?: string; stage?: string; message: string },
            );
          }
        }
      } catch (_) {
        // Malformed/non-JSON frame - discard rather than printing garbage to terminal.
      }
    };

    ws.onclose = (event: CloseEvent) => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      this.stopPingInterval();
      // Only reset awaitingAuthCredentials when the connection closed without
      // us actively waiting for user input (e.g. network drop). If shouldNotReconnect
      // is set alongside it, we're mid-auth-dialog - leave both intact.
      if (!this.shouldNotReconnect) {
        this.awaitingAuthCredentials = false;
      }

      if (this.destroyed) return;

      if (this.shouldNotReconnect) {
        this.notifyFailureOnce(this.lastServerError ?? "Connection closed");
        return;
      }

      // Before the shell was up it's a failed connect, after it a drop.
      if (!this.everConnected) {
        this.notifyFailureOnce(
          this.lastServerError ?? `Connection closed (${event.code})`,
        );
        return;
      }
      const goingAway = event.code === 1000 || event.code === 1001;
      this.drop(
        this.lastServerError ??
          (goingAway
            ? "The server closed the connection"
            : `The socket closed (${event.code})`),
        goingAway ? "server" : "network",
      );
    };

    ws.onerror = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
    };
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "ping" }));
        } catch (_) {}
      }
    }, this.pingMs);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private clearAllTimers(): void {
    this.stopPingInterval();
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private notifyFailureOnce(message: string, noRetry = false): void {
    if (this.hasNotifiedFailure) return;
    this.hasNotifiedFailure = true;
    const failure = { ...fromRelayMessage(message), origin: "relay" as const };
    this.config.onConnectionFailed(
      `${this.config.hostConfig.name}: ${message}`,
      noRetry
        ? {
            ...failure,
            stage: "session",
            hint: "Tap Retry to bring it back here.",
            noRetry,
          }
        : failure,
    );
  }

  private isUnrecoverableError(message: string): boolean {
    return this.isAuthenticationError(message);
  }

  private isAuthenticationError(message: string): boolean {
    if (!message) return false;
    const m = message.toLowerCase();
    return (
      m.includes("password") ||
      m.includes("authentication") ||
      m.includes("permission denied") ||
      m.includes("invalid") ||
      m.includes("incorrect") ||
      m.includes("denied")
    );
  }
}
