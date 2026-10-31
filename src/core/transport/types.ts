import type {
  DisplayConfig,
  DisplayHandlers,
  ExecOptions,
  RemoteDisplay,
  SshExecResult,
  SshSession,
  SshSftp,
} from "@/modules/termix-ssh";
import type { AuthType } from "@/types";
import type { ConnectFailure } from "./errors";

/**
 * How the app reaches a host. "relay" goes through a linked Termix server,
 * "local" is the phone opening SSH itself. Features ask for a transport and
 * never build server URLs on their own.
 */
export type TransportKind = "relay" | "local";

/**
 * What a way of connecting can do. Features list what they need, so a host
 * whose origin can't do it shows a message instead of trying.
 * - `shell`: an interactive terminal
 * - `exec`, `sftp`: commands and files opened by the app itself
 * - `server`: the server's own routes (file manager, docker, metrics, ...)
 * - `guacd`: remote desktop through the server
 * - `forward`: port forwards opened by the app itself (tunnels on the phone)
 * - `tcp`: plain connections the app opens itself (Telnet on the phone)
 */
export type TransportCapability =
  "shell" | "exec" | "sftp" | "server" | "guacd" | "forward" | "tcp";

export interface TerminalHostConfig {
  id: number;
  /** The server finds the host by this first; the same on every device. */
  syncId?: string | null;
  name: string;
  ip: string;
  port: number;
  username: string;
  authType: AuthType;
  password?: string;
  key?: string;
  keyPassword?: string;
  keyType?: string;
  credentialId?: number;
  jumpHosts?: { hostId: number }[];
  forceKeyboardInteractive?: boolean;
  overrideCredentialUsername?: boolean;
}

export type ShellState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "dataReceived"
  | "connectionFailed";

export interface HostKeyData {
  ip: string;
  port: number;
  hostname?: string;
  fingerprint: string;
  oldFingerprint?: string;
  keyType: string;
  oldKeyType?: string;
  algorithm: string;
}

/**
 * Why a live shell went away without the user ending it. `ended` is the
 * remote side closing the channel with no exit status.
 */
export interface ShellDrop {
  kind: "network" | "keepalive" | "server" | "ended";
  reason: string;
}

/** What a shell reports back. Prompts mirror what the server asks for today. */
export interface ShellEvents {
  onStateChange: (state: ShellState, data?: Record<string, unknown>) => void;
  onData: (data: string) => void;
  onTotpRequired: (prompt: string, isPassword: boolean) => void;
  onAuthDialogNeeded: (
    reason: "no_keyboard" | "auth_failed" | "timeout",
  ) => void;
  onHostKeyVerificationRequired?: (
    scenario: "new" | "changed",
    data: HostKeyData,
  ) => void;
  onPassphraseRequired?: () => void;
  onWarpgateAuthRequired?: (url: string, securityKey: string) => void;
  onBrowserCheckRequired?: (
    url: string,
    message: string,
    title?: string,
  ) => void;
  onBrowserCheckCompleted?: () => void;
  onPostConnectionSetup: () => void;
  /** The shell ended on purpose (exit, or the server closed the session). */
  onDisconnected: (hostName: string) => void;
  /**
   * A live shell dropped. Reported once; the shell does not reconnect itself,
   * the connection that owns it does.
   */
  onDropped?: (drop: ShellDrop) => void;
  /** `failure` says which step failed and what to try. */
  onConnectionFailed: (message: string, failure?: ConnectFailure) => void;
  /** Fired when the backend session id is created/attached/cleared. */
  onSessionIdChange?: (sessionId: string | null) => void;
  /** Fired for each connection log line. */
  onConnectionLog?: (entry: {
    level?: string;
    stage?: string;
    message: string;
  }) => void;
  /** The server found several tmux sessions; answer with `attachTmux`. */
  onTmuxSessions?: (sessions: RelayTmuxSession[]) => void;
}

/** A tmux session as the server's ssh-terminal plugin lists it. */
export interface RelayTmuxSession {
  name: string;
  windows?: number;
  attachedClients?: number;
  lastActivity?: number;
}

/** A side command's result on the shell's own SSH connection. */
export interface ShellExecResult {
  stdout: string;
  exitCode: number | null;
}

export interface ShellOptions extends ShellEvents {
  hostConfig: TerminalHostConfig;
  /** Stable tab instance id for cross-device session tracking (open-tabs). */
  tabInstanceId?: string;
  /** Backend session id to attach to on first connect (reviving a tab). */
  initialSessionId?: string | null;
  /** Shorter connect timeout, for a try that has another way to fall back on. */
  connectTimeoutSecs?: number;
  /**
   * Native pipe of the terminal view. A local shell sends its output there instead of `onData`;
   * the relay ignores it.
   */
  pipeId?: string;
  /** Reconnecting after a drop or an app restart, not a first connect. */
  resume?: boolean;
  /** What the shell speaks. Telnet only goes through the phone. */
  protocol?: ShellProtocol;
}

export type ShellProtocol = "ssh" | "telnet";

/** A live shell on a host. */
export interface ShellChannel {
  connect(cols: number, rows: number): Promise<void>;
  sendInput(data: string): void;
  sendResize(cols: number, rows: number): void;
  sendTotpResponse(code: string, isPassword: boolean): void;
  sendHostKeyResponse(action: "accept" | "reject"): void;
  sendPassphraseResponse(passphrase: string): void;
  sendReconnectWithCredentials(
    credentials: { password?: string; sshKey?: string; keyPassword?: string },
    cols: number,
    rows: number,
  ): void;
  sendWarpgateContinue(): void;
  /** Runs a command next to the shell, on the same connection. Phone shells only. */
  exec?(command: string, timeoutSecs?: number): Promise<ShellExecResult>;
  /** The shell's working directory, or null when it can't tell. */
  getCwd?(timeoutMs?: number): Promise<string | null>;
  /** Picks a tmux session the server listed; empty starts a new one. Relay only. */
  attachTmux?(sessionName: string): void;
  notifyBackgrounded(): void;
  notifyForegrounded(): void;
  /** Checks the connection still answers, within `timeoutMs`. */
  probe?(timeoutMs: number): Promise<boolean>;
  /** Low power mode: ping less often. */
  setLowPower?(on: boolean): void;
  destroy(): void;
}

/** A logged in connection for commands and files, with no shell and nobody to ask. */
export interface HostSession {
  exec(command: string, options?: ExecOptions): Promise<SshExecResult>;
  sftp: SshSftp;
  /** The logged in connection, for port forwards and keepalive checks. */
  ssh: SshSession;
  close(): Promise<void>;
}

export interface Transport {
  kind: TransportKind;
  provides: TransportCapability[];
  /** False when this transport can't connect yet, with the reason in `unavailableReason`. */
  available: boolean;
  unavailableReason?: string;
  openShell(options: ShellOptions): ShellChannel;
  /**
   * Exec and SFTP on a host. Only the local transport has it; relay features
   * use the server's own routes. Needs a trusted host key and a saved login.
   */
  openSession?(
    host: TerminalHostConfig,
    options?: { signal?: AbortSignal; connectTimeoutSecs?: number },
  ): Promise<HostSession>;
  /**
   * A VNC or RDP session the phone opens itself, through the host's jump
   * hosts and proxies. Only the local transport has it.
   */
  openDisplay?(
    host: TerminalHostConfig,
    config: DisplayTarget,
    handlers: DisplayHandlers,
    options?: { signal?: AbortSignal },
  ): Promise<LocalDisplay>;
}

/** What to open: the protocol, login and size. Address and proxies come from the host. */
export type DisplayTarget = Omit<DisplayConfig, "host" | "proxies">;

export interface LocalDisplay {
  display: RemoteDisplay;
  /** Stops the session and logs out of the jump hosts. */
  close(): void;
}
