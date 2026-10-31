/** One proxy on the way to the host. Several make a chain; the first is dialed directly. */
export interface SshProxyHop {
  kind: "socks4" | "socks5" | "http";
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface SshPortKnock {
  port: number;
  udp?: boolean;
  /** Wait after this knock. Core's default is 100 ms. */
  delayMs?: number;
}

/** Mirrors the fields of core's connect pipeline that the engine needs. */
export interface SshConnectConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  /** OpenSSH, PEM, PKCS8 or PuTTY PPK text. */
  privateKey?: string;
  passphrase?: string;
  /** OpenSSH user certificate (`*-cert.pub` text) for `privateKey`. Only the certificate is tried. */
  certificate?: string;
  forceKeyboardInteractive?: boolean;
  /** Ask keyboard-interactive prompts when the server offers them. Default true. */
  tryKeyboard?: boolean;
  /** Default true, like core. */
  allowLegacyAlgorithms?: boolean;
  connectTimeoutSecs?: number;
  /** 0 turns keepalive off. */
  keepaliveIntervalSecs?: number;
  keepaliveCountMax?: number;
  proxies?: SshProxyHop[];
  portKnock?: SshPortKnock[];
}

/** A plain TCP connection for Telnet, VNC or RDP. */
export interface SshDialConfig {
  host: string;
  port: number;
  /** Ignored when going through an SSH host. */
  proxies?: SshProxyHop[];
  connectTimeoutSecs?: number;
}

export type DisplayProtocol = "vnc" | "rdp";

export interface DisplayConfig extends SshDialConfig {
  protocol: DisplayProtocol;
  username?: string;
  password?: string;
  /** RDP only. */
  domain?: string;
  /** The size to ask for. VNC servers pick their own. */
  width: number;
  height: number;
  /** RDP desktop scale in percent, 100 to 500. 0 leaves it to the server. */
  scale?: number;
  /** RDP: any, nla or tls, like the plugin's setting. */
  security?: string;
  /**
   * RDP: the certificate fingerprint the user trusted. Any other certificate
   * the phone can't verify stops before the password is sent.
   */
  serverCert?: string | null;
}

export interface SshHostKey {
  host: string;
  port: number;
  /** Like `ssh-ed25519` or `ssh-ed25519-cert-v01@openssh.com`. */
  keyType: string;
  /** Hex of the raw key blob, the format Termix stores. */
  blobHex: string;
  /** `SHA256:...` as OpenSSH prints it. */
  sha256: string;
  isCertificate: boolean;
  caSha256: string | null;
  principals: string[];
}

export interface SshKbdRequest {
  name: string;
  instructions: string;
  prompts: { prompt: string; echo: boolean }[];
  /** 0 for the first round of this login. */
  round: number;
}

export interface SshAlgorithms {
  kex: string;
  hostKey: string;
  cipher: string;
  mac: string;
}

/** Answers the engine needs from the app while logging in. */
export interface SshPrompts {
  verifyHostKey(key: SshHostKey): Promise<boolean>;
  /** Resolve null to cancel the login. */
  keyboardInteractive(request: SshKbdRequest): Promise<string[] | null>;
  onBanner?(banner: string): void;
}

export type SshDisconnectKind = "server" | "keepalive" | "network" | "local";

export interface SshDisconnect {
  kind: SshDisconnectKind;
  reason: string;
}

export interface SshExecResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
  exitCode: number | null;
  exitSignal: string | null;
  /** Output went past `maxBytes` and the rest was dropped. */
  truncated: boolean;
}

export interface SshFileEntry {
  name: string;
  size: number;
  isDir: boolean;
  isSymlink: boolean;
  /** Full st_mode, file type bits included. */
  permissions: number;
  mtime: number;
  atime: number;
  uid: number | null;
  gid: number | null;
  /** Where a symlink points. */
  linkTarget: string | null;
}

export interface SshTransferResult {
  bytes: number;
  millis: number;
}

export interface SshKeyInfo {
  keyType: string;
  bits: number;
  sha256: string;
  /** The `authorized_keys` line. */
  publicOpenssh: string;
  encrypted: boolean;
  format: "openssh" | "pem" | "pkcs8" | "ppk";
  comment: string;
}

export interface SshCertInfo {
  keyType: string;
  keyId: string;
  serial: number;
  principals: string[];
  /** Unix seconds. */
  validAfter: number;
  validBefore: number;
  caSha256: string;
  isHost: boolean;
}

export type SshErrorKind =
  | "connect"
  | "hostKeyRejected"
  | "passphraseRequired"
  | "badPassphrase"
  | "invalidKey"
  | "auth"
  | "authMethodNotAvailable"
  | "authCancelled"
  | "cancelled"
  | "timeout"
  | "channel"
  | "sftp"
  | "io"
  | "disconnected"
  | "unavailable";

/** What the native module sends and accepts. Binary data travels as base64. */
export interface NativeSessionInfo {
  hostKey: SshHostKey;
  algorithms: SshAlgorithms | null;
}

export interface NativeExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  exitSignal: string | null;
  truncated: boolean;
}

export interface TermixSshNativeModule {
  engineVersion(): string;
  connect(
    sessionId: string,
    config: SshConnectConfig,
    parentSessionId: string | null,
  ): Promise<NativeSessionInfo>;
  reconnect(sessionId: string): Promise<NativeSessionInfo>;
  /** Fires the cancel token of a call, and for a login also drops its open prompts. */
  cancel(opId: string): void;
  answerHostKey(requestId: string, accept: boolean): void;
  answerKeyboardInteractive(requestId: string, answers: string[] | null): void;
  isClosed(sessionId: string): boolean;
  ping(sessionId: string, timeoutSecs: number): Promise<void>;
  disconnect(sessionId: string): Promise<void>;
  exec(
    sessionId: string,
    opId: string,
    command: string,
    timeoutSecs: number,
    maxBytes: number,
  ): Promise<NativeExecResult>;
  execStream(
    sessionId: string,
    execId: string,
    command: string,
    pty: { term: string; cols: number; rows: number } | null,
  ): Promise<void>;
  execWrite(execId: string, data: string): Promise<void>;
  execEof(execId: string): Promise<void>;
  execSignal(execId: string, name: string): Promise<void>;
  execClose(execId: string): Promise<void>;
  openShell(
    sessionId: string,
    shellId: string,
    term: string,
    cols: number,
    rows: number,
    env: Record<string, string>,
    pipeId: string | null,
  ): Promise<void>;
  openTelnet(
    shellId: string,
    dial: SshDialConfig,
    term: string,
    cols: number,
    rows: number,
    login: { username?: string; password?: string },
    viaSessionId: string | null,
    pipeId: string | null,
  ): Promise<void>;
  displayProtocols(): DisplayProtocol[];
  openDisplay(
    displayId: string,
    config: DisplayConfig,
    viaSessionId: string | null,
  ): Promise<void>;
  displayPointer(
    displayId: string,
    x: number,
    y: number,
    buttons: number,
  ): void;
  displayKeySym(displayId: string, sym: number, down: boolean): void;
  displayUnicode(displayId: string, ch: number, down: boolean): void;
  displayClipboard(displayId: string, text: string): void;
  displayResize(
    displayId: string,
    width: number,
    height: number,
    scale: number,
  ): void;
  displayRefresh(displayId: string): void;
  closeDisplay(displayId: string): void;
  writeShell(shellId: string, data: string): Promise<void>;
  resizeShell(shellId: string, cols: number, rows: number): Promise<void>;
  signalShell(shellId: string, name: string): Promise<void>;
  closeShell(shellId: string): Promise<void>;
  sftpList(sessionId: string, path: string): Promise<SshFileEntry[]>;
  sftpStat(sessionId: string, path: string): Promise<SshFileEntry>;
  sftpLstat(sessionId: string, path: string): Promise<SshFileEntry>;
  sftpSize(sessionId: string, path: string): Promise<number>;
  sftpRealpath(sessionId: string, path: string): Promise<string>;
  sftpReadLink(sessionId: string, path: string): Promise<string>;
  sftpSymlink(sessionId: string, path: string, target: string): Promise<void>;
  sftpMkdir(
    sessionId: string,
    path: string,
    mode: number | null,
  ): Promise<void>;
  sftpRmdir(sessionId: string, path: string): Promise<void>;
  sftpRename(sessionId: string, from: string, to: string): Promise<void>;
  sftpChmod(sessionId: string, path: string, mode: number): Promise<void>;
  sftpRemove(sessionId: string, path: string): Promise<void>;
  sftpRemoveRecursive(
    sessionId: string,
    opId: string,
    path: string,
  ): Promise<number>;
  sftpReadFile(
    sessionId: string,
    path: string,
    maxBytes: number,
  ): Promise<string>;
  sftpWriteFile(
    sessionId: string,
    path: string,
    data: string,
    mode: number | null,
  ): Promise<void>;
  sftpDownload(
    sessionId: string,
    opId: string,
    remote: string,
    localPath: string,
    offset: number,
  ): Promise<SshTransferResult>;
  sftpUpload(
    sessionId: string,
    opId: string,
    localPath: string,
    remote: string,
    offset: number,
  ): Promise<SshTransferResult>;
  forwardLocal(
    sessionId: string,
    forwardId: string,
    bindHost: string,
    bindPort: number,
    remoteHost: string,
    remotePort: number,
  ): Promise<number>;
  forwardDynamic(
    sessionId: string,
    forwardId: string,
    bindHost: string,
    bindPort: number,
  ): Promise<number>;
  forwardRemote(
    sessionId: string,
    forwardId: string,
    remoteBindHost: string,
    remotePort: number,
    localHost: string,
    localPort: number,
  ): Promise<number>;
  closeForward(forwardId: string): Promise<void>;
  inspectKey(text: string, passphrase: string | null): SshKeyInfo;
  convertKeyToOpenssh(
    text: string,
    passphrase: string | null,
    newPassphrase: string | null,
  ): string;
  inspectCertificate(text: string): SshCertInfo;
  addListener(
    event: string,
    listener: (payload: never) => void,
  ): { remove(): void };
}

export interface NativeEvents {
  onHostKey: { sessionId: string; requestId: string; hostKey: SshHostKey };
  onKeyboardInteractive: {
    sessionId: string;
    requestId: string;
    request: SshKbdRequest;
  };
  onBanner: { sessionId: string; banner: string };
  onDisconnect: { sessionId: string; kind: SshDisconnectKind; reason: string };
  onShellData: { shellId: string; data: string };
  onShellActive: { shellId: string };
  onShellExit: {
    shellId: string;
    exitCode: number | null;
    exitSignal: string | null;
  };
  onExecData: { execId: string; stream: "stdout" | "stderr"; data: string };
  onExecExit: {
    execId: string;
    exitCode: number | null;
    exitSignal: string | null;
  };
  onProgress: { opId: string; done: number; total: number };
  onDisplayResize: { displayId: string; width: number; height: number };
  onDisplayClipboard: { displayId: string; text: string };
  onDisplayClosed: { displayId: string; reason: string | null };
}
