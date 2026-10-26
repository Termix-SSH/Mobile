import { recordConnect } from "@/core/analytics/usage";
import type { ConnectionLogEntry, ConnectionLogPayload } from "@/types";
import {
  fromRelayMessage,
  hintFor,
  isTailnetAddress,
  TAILSCALE_HINT,
  unavailable,
  type ConnectFailure,
} from "./errors";
import type { Blocked } from "./origin";
import { isRetryable, MAX_RECONNECT_TRIES, reconnectDelay } from "./reconnect";
import type {
  HostKeyData,
  RelayTmuxSession,
  ShellDrop,
  ShellExecResult,
  ShellChannel,
  ShellOptions,
  ShellProtocol,
  TerminalHostConfig,
  Transport,
  TransportKind,
} from "./types";

/** Something the connection waits on the user for. */
export type ConnectionPrompt =
  | { kind: "totp"; prompt: string; isPassword: boolean }
  | { kind: "auth"; reason: "no_keyboard" | "auth_failed" | "timeout" }
  | { kind: "hostKey"; scenario: "new" | "changed"; data: HostKeyData }
  | { kind: "passphrase" }
  | { kind: "warpgate"; url: string; securityKey: string }
  | { kind: "browserCheck"; url: string; message: string; title?: string };

export type ConnectionStatus =
  | { status: "idle" }
  | {
      status: "connecting";
      origin: TransportKind;
      /** Index into the plan's attempts. */
      attempt: number;
      /** Reconnect try after a drop, 0 for the first connect. */
      retry: number;
    }
  | { status: "prompt"; origin: TransportKind; prompt: ConnectionPrompt }
  | { status: "connected"; origin: TransportKind; hasData: boolean }
  | {
      status: "reconnecting";
      origin: TransportKind;
      /** Try number after the drop, from 1. */
      attempt: number;
      /** When the next try starts; null while a try is running. */
      nextAt: number | null;
      reason: string;
    }
  | { status: "offline"; origin: TransportKind; reason: string }
  | { status: "failed"; failure: ConnectFailure; fix?: Blocked["fix"] }
  | { status: "closed" };

export type ConnectionEvent =
  | { type: "start"; origin: TransportKind; attempt: number }
  | { type: "connecting"; retry: number }
  | {
      type: "reconnecting";
      attempt: number;
      nextAt: number | null;
      reason: string;
    }
  | { type: "offline"; reason: string }
  | { type: "prompt"; prompt: ConnectionPrompt }
  | { type: "answered" }
  | { type: "connected" }
  | { type: "data" }
  | { type: "failed"; failure: ConnectFailure; fix?: Blocked["fix"] }
  | { type: "closed" }
  | { type: "reset" };

const originOf = (s: ConnectionStatus): TransportKind | null =>
  "origin" in s ? s.origin : null;

/** The pure part of the state machine. Returns the same object when nothing changed. */
export function reduceConnection(
  s: ConnectionStatus,
  e: ConnectionEvent,
): ConnectionStatus {
  switch (e.type) {
    case "reset":
      return { status: "idle" };
    case "start":
      return {
        status: "connecting",
        origin: e.origin,
        attempt: e.attempt,
        retry: 0,
      };
    case "connecting": {
      const origin = originOf(s);
      if (!origin) return s;
      // A reconnect try opening its shell stays a reconnect.
      if (s.status === "reconnecting")
        return s.nextAt === null ? s : { ...s, nextAt: null };
      const attempt = s.status === "connecting" ? s.attempt : 0;
      if (s.status === "connecting" && s.retry === e.retry) return s;
      return { status: "connecting", origin, attempt, retry: e.retry };
    }
    case "reconnecting": {
      const origin = originOf(s);
      if (!origin) return s;
      if (
        s.status === "reconnecting" &&
        s.attempt === e.attempt &&
        s.nextAt === e.nextAt &&
        s.reason === e.reason
      )
        return s;
      return {
        status: "reconnecting",
        origin,
        attempt: e.attempt,
        nextAt: e.nextAt,
        reason: e.reason,
      };
    }
    case "offline": {
      const origin = originOf(s);
      if (!origin) return s;
      if (s.status === "offline" && s.reason === e.reason) return s;
      return { status: "offline", origin, reason: e.reason };
    }
    case "prompt": {
      const origin = originOf(s);
      if (!origin || s.status === "failed" || s.status === "closed") return s;
      return { status: "prompt", origin, prompt: e.prompt };
    }
    case "answered": {
      if (s.status !== "prompt") return s;
      return { status: "connecting", origin: s.origin, attempt: 0, retry: 0 };
    }
    case "connected": {
      const origin = originOf(s);
      if (!origin) return s;
      // A Tailscale check may still show while the shell opens.
      return { status: "connected", origin, hasData: false };
    }
    case "data":
      if (s.status !== "connected" || s.hasData) return s;
      return { ...s, hasData: true };
    case "failed":
      return { status: "failed", failure: e.failure, fix: e.fix };
    case "closed":
      return { status: "closed" };
  }
}

export interface PlannedAttempts {
  attempts: Transport[];
  blocked?: Blocked;
}

export interface ConnectedInfo {
  fromBackground: boolean;
  /** The server put the tab back on its old session. */
  isReattach: boolean;
  /** A reconnect after a drop or a restart, not the first connect. */
  resumed: boolean;
}

export interface HostConnectionOptions {
  host: TerminalHostConfig;
  /** Which ways to try. Asked again on every connect and retry. */
  plan: () => Promise<PlannedAttempts>;
  tabInstanceId?: string;
  initialSessionId?: string | null;
  /** Native pipe of the terminal view, for shells that can feed it directly. */
  pipeId?: string;
  /** Telnet instead of SSH. Only phone transports can open it. */
  protocol?: ShellProtocol;
  /** Connect timeout for a try that has a fallback after it. */
  fallbackTimeoutSecs?: number;
  /** A tab brought back after the app restarted: its first connect is a resume. */
  restored?: boolean;
  onData: (data: string) => void;
  onConnected?: (info: ConnectedInfo) => void;
  /** The shell is new and ready for startup lines. `resumed` after a reconnect. */
  onPostConnectionSetup?: (info: { resumed: boolean }) => void;
  onDisconnected?: (hostName: string) => void;
  onSessionIdChange?: (sessionId: string | null) => void;
  /** Fires when a try starts, with the way it goes. */
  onOriginResolved?: (kind: TransportKind) => void;
  onTmuxSessions?: (sessions: RelayTmuxSession[]) => void;
}

export interface ConnectionSnapshot {
  state: ConnectionStatus;
  log: ConnectionLogEntry[];
  /** Characters typed while not connected, waiting to be sent. */
  pending: number;
  /**
   * The queue is held because the reconnect opened a new shell; the user
   * picks send or discard.
   */
  pendingHeld: boolean;
}

/** What the app knows about the network, from the lifecycle listener. */
export interface NetworkInfo {
  connected: boolean;
  type: string;
  vpn: boolean;
  /** The way out changed (Wi-Fi to cellular, a VPN up or down). */
  changed: boolean;
}

const FALLBACK_STAGES = new Set(["network"]);
const MAX_LOG = 500;
const MAX_PENDING = 64 * 1024;
const PROBE_MS = 3000;

let logSeq = 0;

/**
 * One connection to a host, for either transport. Owns the shell channel,
 * the prompts it raises, the connection log, the fallback from the phone to
 * the server, and reconnecting after a drop. Screens render its state and
 * call its answer methods.
 */
export class HostConnection {
  private snapshot: ConnectionSnapshot = {
    state: { status: "idle" },
    log: [],
    pending: 0,
    pendingHeld: false,
  };
  private listeners = new Set<() => void>();
  private channel: ShellChannel | null = null;
  private attempts: Transport[] = [];
  private attempt = 0;
  private prompted = false;
  private cols = 80;
  private rows = 24;
  private sessionId: string | null;
  private destroyed = false;
  private run = 0;
  // Reconnecting
  private resuming: boolean;
  private lastResumed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private dropReason = "";
  private online = true;
  private vpn: boolean | null = null;
  private lowPower = false;
  private pendingInput = "";
  private pendingTrimmed = false;

  constructor(private readonly options: HostConnectionOptions) {
    this.sessionId = options.initialSessionId ?? null;
    this.resuming = !!options.restored;
  }

  // Store

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ConnectionSnapshot => this.snapshot;

  get state(): ConnectionStatus {
    return this.snapshot.state;
  }

  private set(next: ConnectionSnapshot) {
    if (next === this.snapshot) return;
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  private dispatch(event: ConnectionEvent) {
    const prev = this.snapshot.state;
    const state = reduceConnection(prev, event);
    if (state === prev) return;
    this.set({ ...this.snapshot, state });
    this.countResult(prev, state);
  }

  /** Feeds the usage counts: how a connect ended, as a class only. */
  private countResult(prev: ConnectionStatus, next: ConnectionStatus) {
    if (next.status === "connected" && prev.status !== "reconnecting") {
      void recordConnect(next.origin, "ok").catch(() => {});
    } else if (next.status === "failed" && next.failure.origin) {
      void recordConnect(next.failure.origin, next.failure.stage).catch(
        () => {},
      );
    }
  }

  log(payload: ConnectionLogPayload) {
    const entry: ConnectionLogEntry = {
      ...payload,
      id: `log_${++logSeq}`,
      timestamp: Date.now(),
    };
    const log = [...this.snapshot.log, entry];
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    this.set({ ...this.snapshot, log });
  }

  clearLog = () => {
    if (this.snapshot.log.length) this.set({ ...this.snapshot, log: [] });
  };

  // Connecting

  /** Called when the terminal knows its size. Starts the first try. */
  async connect(cols: number, rows: number): Promise<void> {
    this.cols = cols;
    this.rows = rows;
    if (this.channel) {
      // A second ready from the view: the shell is already up.
      this.channel.sendResize(cols, rows);
      return;
    }
    if (this.state.status !== "idle") return;
    await this.start();
  }

  /** Starts over with a fresh plan (after a failure, or an origin change). */
  async retry(): Promise<void> {
    this.dropChannel();
    this.clearReconnect();
    this.reconnectAttempt = 0;
    this.dispatch({ type: "reset" });
    await this.start();
  }

  private async start() {
    const run = ++this.run;
    let planned: PlannedAttempts;
    try {
      planned = await this.options.plan();
    } catch (err) {
      if (run !== this.run || this.destroyed) return;
      this.failWith(
        unavailable(err instanceof Error ? err.message : String(err)),
      );
      return;
    }
    if (run !== this.run || this.destroyed) return;
    this.attempts = planned.attempts;
    if (!this.attempts.length) {
      const blocked = planned.blocked ?? { reason: "Can't connect." };
      this.failWith(unavailable(blocked.reason), blocked.fix);
      return;
    }
    this.open(0);
  }

  private open(index: number) {
    const transport = this.attempts[index];
    this.attempt = index;
    this.prompted = false;
    if (this.state.status !== "reconnecting") {
      this.dispatch({ type: "start", origin: transport.kind, attempt: index });
      const name = this.options.host.name || this.options.host.ip;
      this.log({
        level: "info",
        stage: "connection",
        message:
          transport.kind === "local"
            ? `Connecting to ${name} from this phone`
            : `Connecting to ${name} through the server`,
      });
    }
    this.options.onOriginResolved?.(transport.kind);
    // A reconnect stays on the way that worked; no fallback mid session.
    const hasFallback = !this.resuming && index < this.attempts.length - 1;
    try {
      this.channel = transport.openShell(this.shellOptions(hasFallback));
    } catch (err) {
      this.channel = null;
      this.onFailed(
        err instanceof Error ? err.message : String(err),
        unavailable(err instanceof Error ? err.message : String(err)),
      );
      return;
    }
    if (this.lowPower) this.channel.setLowPower?.(true);
    this.channel.connect(this.cols, this.rows).catch((err) => {
      this.onFailed(String(err));
    });
  }

  private shellOptions(hasFallback: boolean): ShellOptions {
    const channelAt = this.run;
    const live = () => !this.destroyed && channelAt === this.run;
    const guard =
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        if (live()) fn(...args);
      };
    return {
      hostConfig: this.options.host,
      tabInstanceId: this.options.tabInstanceId,
      pipeId: this.options.pipeId,
      protocol: this.options.protocol,
      initialSessionId: this.sessionId,
      connectTimeoutSecs: hasFallback
        ? (this.options.fallbackTimeoutSecs ?? 8)
        : undefined,
      resume: this.resuming,
      onSessionIdChange: guard((id) => {
        this.sessionId = id;
        this.options.onSessionIdChange?.(id);
      }),
      onStateChange: guard((state, data) => {
        switch (state) {
          case "connecting": {
            const retry = (data?.retryCount as number) || 0;
            if (retry > 0) {
              this.log({
                level: "info",
                stage: "connection",
                message: `Reconnecting (try ${retry})`,
              });
            }
            this.dispatch({ type: "connecting", retry });
            break;
          }
          case "connected":
            this.onConnected(data);
            break;
          case "dataReceived":
            this.dispatch({ type: "data" });
            break;
        }
      }),
      onData: guard((data) => this.options.onData(data)),
      onTotpRequired: guard((prompt, isPassword) =>
        this.ask({ kind: "totp", prompt, isPassword }),
      ),
      onAuthDialogNeeded: guard((reason) => this.ask({ kind: "auth", reason })),
      onHostKeyVerificationRequired: guard((scenario, data) =>
        this.ask({ kind: "hostKey", scenario, data }),
      ),
      onPassphraseRequired: guard(() => this.ask({ kind: "passphrase" })),
      onWarpgateAuthRequired: guard((url, securityKey) =>
        this.ask({ kind: "warpgate", url, securityKey }),
      ),
      onBrowserCheckRequired: guard((url, message, title) =>
        this.ask({ kind: "browserCheck", url, message, title }),
      ),
      onBrowserCheckCompleted: guard(() => {
        const s = this.state;
        if (s.status === "prompt" && s.prompt.kind === "browserCheck") {
          this.dispatch({ type: "answered" });
        }
      }),
      onPostConnectionSetup: guard(() =>
        this.options.onPostConnectionSetup?.({ resumed: this.lastResumed }),
      ),
      onTmuxSessions: guard((sessions) =>
        this.options.onTmuxSessions?.(sessions),
      ),
      onDisconnected: guard((hostName) => {
        this.log({
          level: "warning",
          stage: "connection",
          message: "Disconnected",
        });
        this.dropChannel();
        this.clearReconnect();
        this.dispatch({ type: "closed" });
        this.options.onDisconnected?.(hostName);
      }),
      onDropped: guard((drop) => this.onDropped(drop)),
      onConnectionFailed: guard((message, failure) =>
        this.onFailed(message, failure),
      ),
      onConnectionLog: guard((entry) =>
        this.log({
          level: (entry.level as ConnectionLogPayload["level"]) || "info",
          stage: entry.stage,
          message: entry.message,
        }),
      ),
    };
  }

  private onConnected(data?: Record<string, unknown>) {
    const isReattach = !!data?.isReattach;
    const resumed = this.resuming;
    this.lastResumed = resumed;
    this.resuming = false;
    this.reconnectAttempt = 0;
    this.clearReconnect();
    this.log({
      level: "success",
      stage: "connection",
      message: !resumed
        ? "Connected"
        : isReattach
          ? "Reconnected to the same session"
          : "Reconnected with a new shell",
    });
    this.dispatch({ type: "connected" });
    // Typed input only goes on its own to the shell it was typed for.
    if (!resumed || isReattach) this.flushInput();
    else if (this.pendingInput) this.setPending(true);
    this.options.onConnected?.({
      fromBackground: !!data?.fromBackground,
      isReattach,
      resumed,
    });
  }

  private ask(prompt: ConnectionPrompt) {
    // A browser check is shown, not answered, so it doesn't stop a fallback.
    if (prompt.kind !== "browserCheck") this.prompted = true;
    this.dispatch({ type: "prompt", prompt });
  }

  private onFailed(message: string, failure?: ConnectFailure) {
    const origin = this.attempts[this.attempt]?.kind;
    const f: ConnectFailure = {
      ...(failure ?? fromRelayMessage(message)),
      origin: failure?.origin ?? origin,
    };
    if (this.resuming && !this.prompted && isRetryable(f)) {
      this.log({ level: "warning", stage: "connection", message: f.message });
      this.dropChannel();
      this.scheduleReconnect(f.message);
      return;
    }
    const next = this.attempts[this.attempt + 1];
    if (
      next &&
      !this.resuming &&
      !this.prompted &&
      FALLBACK_STAGES.has(f.stage)
    ) {
      this.log({ level: "warning", stage: "connection", message: f.message });
      this.log({
        level: "info",
        stage: "connection",
        message:
          next.kind === "relay"
            ? "Could not reach the host from this phone, trying through the server"
            : "Could not connect through the server, trying from this phone",
      });
      this.dropChannel();
      this.open(this.attempt + 1);
      return;
    }
    this.failWith(f);
  }

  private failWith(failure: ConnectFailure, fix?: Blocked["fix"]) {
    let f = failure;
    if (
      f.stage === "network" &&
      this.vpn !== true &&
      isTailnetAddress(this.options.host.ip || "")
    ) {
      f = { ...f, hint: TAILSCALE_HINT };
    }
    this.resuming = false;
    this.clearReconnect();
    this.log({
      level: "error",
      stage: f.stage,
      message: f.message,
    });
    this.dropChannel();
    this.dispatch({ type: "failed", failure: f, fix });
  }

  private dropChannel() {
    // Bumping the run makes callbacks from the old channel no-ops.
    this.run++;
    const channel = this.channel;
    this.channel = null;
    channel?.destroy();
  }

  // Reconnecting

  private onDropped(drop: ShellDrop) {
    this.log({
      level: "warning",
      stage: "connection",
      message: `Connection lost: ${drop.reason}`,
    });
    this.dropChannel();
    this.reconnectAttempt = 0;
    this.scheduleReconnect(drop.reason);
  }

  private scheduleReconnect(reason: string) {
    if (this.destroyed) return;
    this.clearReconnect();
    this.resuming = true;
    this.dropReason = reason;
    if (!this.online) {
      if (this.state.status !== "offline") {
        this.log({
          level: "info",
          stage: "connection",
          message: "Offline, waiting for the network",
        });
      }
      this.dispatch({ type: "offline", reason });
      return;
    }
    this.reconnectAttempt++;
    if (this.reconnectAttempt > MAX_RECONNECT_TRIES) {
      this.failWith({
        stage: "session",
        message: reason,
        hint: hintFor("session"),
        origin: originOf(this.state) ?? undefined,
      });
      return;
    }
    const delay = reconnectDelay(this.reconnectAttempt, {
      lowPower: this.lowPower,
    });
    if (delay === 0) {
      this.resume();
      return;
    }
    this.dispatch({
      type: "reconnecting",
      attempt: this.reconnectAttempt,
      nextAt: Date.now() + delay,
      reason,
    });
    this.log({
      level: "info",
      stage: "connection",
      message: `Next try in ${Math.round(delay / 1000)}s`,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.resume();
    }, delay);
  }

  /** Starts the next reconnect try now. Only one runs at a time. */
  private resume() {
    if (this.destroyed || this.channel) return;
    this.clearReconnect();
    this.resuming = true;
    if (this.reconnectAttempt < 1) this.reconnectAttempt = 1;
    // A restored tab has no origin yet; it starts like a first connect.
    if (!this.attempts.length) {
      void this.start();
      return;
    }
    this.dispatch({
      type: "reconnecting",
      attempt: this.reconnectAttempt,
      nextAt: null,
      reason: this.dropReason,
    });
    this.log({
      level: "info",
      stage: "connection",
      message: `Reconnecting (try ${this.reconnectAttempt})`,
    });
    this.open(this.attempt);
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  /** Waiting for the next try, or offline. */
  private get waiting(): boolean {
    const s = this.state.status;
    return s === "offline" || (s === "reconnecting" && !this.channel);
  }

  /** The Reconnect now button. After a failure it starts over. */
  reconnectNow() {
    const s = this.state.status;
    if (s === "failed" || s === "closed") {
      void this.retry();
      return;
    }
    if (this.waiting) {
      if (this.reconnectAttempt < 1) this.reconnectAttempt = 1;
      this.resume();
    }
  }

  private probe() {
    const channel = this.channel;
    if (!channel?.probe || this.state.status !== "connected") return;
    const run = this.run;
    channel.probe(PROBE_MS).then(
      (ok) => {
        if (ok || run !== this.run || this.destroyed) return;
        this.onDropped({
          kind: "network",
          reason: "The host stopped answering",
        });
      },
      () => {},
    );
  }

  /** From the app wide network listener. */
  notifyNetworkChanged(info: NetworkInfo) {
    this.vpn = info.vpn;
    if (!info.connected) {
      if (!this.online) return;
      this.online = false;
      this.log({ level: "warning", stage: "network", message: "Network lost" });
      if (this.waiting) {
        this.clearReconnect();
        this.dispatch({ type: "offline", reason: this.dropReason });
      }
      return;
    }
    const wasOffline = !this.online;
    this.online = true;
    if (wasOffline || info.changed) {
      this.log({
        level: "info",
        stage: "network",
        message: `Network: ${info.type}${info.vpn ? " with VPN" : ""}`,
      });
    }
    if (this.waiting) {
      // The network is back: the next try runs now, with every try left.
      this.reconnectAttempt = 1;
      this.resume();
      return;
    }
    // The old socket may be tied to the network that just went away.
    if (wasOffline || info.changed) this.probe();
  }

  setLowPower(on: boolean) {
    if (this.lowPower === on) return;
    this.lowPower = on;
    this.log({
      level: "info",
      stage: "power",
      message: on ? "Low power mode on" : "Low power mode off",
    });
    this.channel?.setLowPower?.(on);
  }

  // Typed input while not connected

  private setPending(held: boolean) {
    const pending = this.pendingInput.length;
    if (!pending) this.pendingTrimmed = false;
    const pendingHeld = held && pending > 0;
    if (
      pending === this.snapshot.pending &&
      pendingHeld === this.snapshot.pendingHeld
    )
      return;
    this.set({ ...this.snapshot, pending, pendingHeld });
  }

  /** Sends what was typed while reconnecting. */
  flushInput() {
    const data = this.pendingInput;
    this.pendingInput = "";
    this.setPending(false);
    if (data && this.channel) this.channel.sendInput(data);
  }

  /** Drops what was typed while reconnecting. */
  discardInput() {
    if (!this.pendingInput) return;
    this.log({
      level: "info",
      stage: "connection",
      message: `Dropped ${this.pendingInput.length} typed characters`,
    });
    this.pendingInput = "";
    this.setPending(false);
  }

  // Answers

  answerTotp(code: string) {
    const s = this.state;
    if (s.status !== "prompt" || s.prompt.kind !== "totp") return;
    this.channel?.sendTotpResponse(code, s.prompt.isPassword);
    this.dispatch({ type: "answered" });
  }

  answerAuth(credentials: {
    password?: string;
    sshKey?: string;
    keyPassword?: string;
  }) {
    this.channel?.sendReconnectWithCredentials(
      credentials,
      this.cols,
      this.rows,
    );
    this.dispatch({ type: "answered" });
  }

  answerHostKey(accept: boolean) {
    this.channel?.sendHostKeyResponse(accept ? "accept" : "reject");
    if (accept) {
      this.dispatch({ type: "answered" });
      return;
    }
    this.failWith({
      stage: "hostKey",
      message: "You did not trust the host key.",
      hint: "Check the key with whoever runs the host, then try again.",
      origin: originOf(this.state) ?? undefined,
    });
  }

  answerPassphrase(passphrase: string) {
    this.channel?.sendPassphraseResponse(passphrase);
    this.dispatch({ type: "answered" });
  }

  continueBrowserSignIn() {
    this.channel?.sendWarpgateContinue();
    this.dispatch({ type: "answered" });
  }

  /** The user closed a prompt. */
  cancel() {
    if (this.state.status === "failed" || this.state.status === "closed")
      return;
    this.failWith({
      stage: "cancelled",
      message: "Login cancelled.",
      hint: "Connect again when you are ready.",
      origin: originOf(this.state) ?? undefined,
    });
  }

  // Passthrough

  /** A side command on the shell's connection, when the shell can run one. */
  exec(command: string, timeoutSecs?: number): Promise<ShellExecResult> {
    const exec = this.channel?.exec?.bind(this.channel);
    if (!exec)
      return Promise.reject(new Error("This connection can't run commands"));
    return exec(command, timeoutSecs);
  }

  /** The shell's working directory, when the connection can tell. */
  getCwd(timeoutMs?: number): Promise<string | null> {
    if (this.state.status !== "connected" || !this.channel?.getCwd) {
      return Promise.resolve(null);
    }
    return this.channel.getCwd(timeoutMs);
  }

  attachTmux(sessionName: string) {
    this.channel?.attachTmux?.(sessionName);
  }

  /** Sends typed input, or keeps it until the shell is back. */
  sendInput(data: string) {
    const s = this.state.status;
    if (s === "connected" && this.channel && !this.snapshot.pendingHeld) {
      this.channel.sendInput(data);
      return;
    }
    if (s === "failed" || s === "closed" || s === "idle") return;
    let next = this.pendingInput + data;
    if (next.length > MAX_PENDING) {
      if (!this.pendingTrimmed) {
        this.pendingTrimmed = true;
        this.log({
          level: "warning",
          stage: "connection",
          message: "Typed input is over 64 KB, the oldest part was dropped",
        });
      }
      next = next.slice(next.length - MAX_PENDING);
    }
    this.pendingInput = next;
    this.setPending(this.snapshot.pendingHeld);
  }

  /** Writes straight to the shell, skipping the queue. For startup lines. */
  sendNow(data: string) {
    this.channel?.sendInput(data);
  }

  resize(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.channel?.sendResize(cols, rows);
  }

  notifyBackgrounded() {
    this.log({ level: "info", stage: "app", message: "App in the background" });
    this.channel?.notifyBackgrounded();
  }

  notifyForegrounded() {
    this.log({ level: "info", stage: "app", message: "App in the foreground" });
    this.channel?.notifyForegrounded();
    if (this.waiting && this.online) {
      // Back in the app: try now, with every try left.
      this.reconnectAttempt = 1;
      this.resume();
      return;
    }
    // The OS may have cut the socket without telling anyone.
    this.probe();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearReconnect();
    this.dropChannel();
    this.listeners.clear();
  }
}
