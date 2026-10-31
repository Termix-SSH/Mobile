/**
 * TermixSsh - the native SSH and SFTP engine (Rust russh core).
 *
 * Every call goes to the phone's own engine, no server involved. The local
 * transport in src/core/transport builds on this. Binary data crosses the
 * bridge as base64; this file hides that, the event plumbing and cancelling.
 */
import { requireOptionalNativeModule } from "expo-modules-core";

import { fromBase64, toBase64, utf8Encode } from "./src/base64";
import type {
  DisplayConfig,
  DisplayProtocol,
  NativeEvents,
  NativeExecResult,
  NativeSessionInfo,
  SshAlgorithms,
  SshCertInfo,
  SshConnectConfig,
  SshDialConfig,
  SshDisconnect,
  SshErrorKind,
  SshExecResult,
  SshFileEntry,
  SshHostKey,
  SshKeyInfo,
  SshPrompts,
  SshTransferResult,
  TermixSshNativeModule,
} from "./src/types";

export * from "./src/types";
export { fromBase64, toBase64, utf8Decode, utf8Encode } from "./src/base64";

const Native = requireOptionalNativeModule<TermixSshNativeModule>("TermixSsh");

/** False in Expo Go, on web and in builds without the module. */
export const isSshEngineAvailable = Native != null;

const ERROR_KINDS: SshErrorKind[] = [
  "connect",
  "hostKeyRejected",
  "passphraseRequired",
  "badPassphrase",
  "invalidKey",
  "auth",
  "authMethodNotAvailable",
  "authCancelled",
  "cancelled",
  "timeout",
  "channel",
  "sftp",
  "io",
  "disconnected",
];

export class SshError extends Error {
  constructor(
    readonly kind: SshErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SshError";
  }
}

/**
 * The RDP server showed a certificate the user hasn't trusted: a first
 * connect ("new") or another one than before ("changed"). Null for other errors.
 */
export function rdpCertProblem(
  err: unknown,
): { kind: "new" | "changed"; fingerprint: string } | null {
  const message = (err as { message?: string } | undefined)?.message ?? "";
  const m = /RDP_CERT_(NEW|CHANGED) ([0-9A-F:]+)/.exec(message);
  if (!m) return null;
  return { kind: m[1] === "NEW" ? "new" : "changed", fingerprint: m[2] };
}

/** Native errors arrive with codes like `SSH_AUTH`; turn them into SshError. */
export function toSshError(err: unknown): SshError {
  if (err instanceof SshError) return err;
  const e = err as { code?: string; message?: string } | undefined;
  const code = (e?.code ?? "").replace(/^ERR_/, "");
  const kind = code.startsWith("SSH_")
    ? ERROR_KINDS.find(
        (k) => k.toUpperCase() === code.slice(4).replace(/_/g, ""),
      )
    : undefined;
  return new SshError(kind ?? "io", e?.message ?? String(err));
}

function native(): TermixSshNativeModule {
  if (!Native) {
    throw new SshError(
      "unavailable",
      "The SSH engine is not in this build of the app.",
    );
  }
  return Native;
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toSshError(err);
  }
}

function callSync<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw toSshError(err);
  }
}

function on<K extends keyof NativeEvents>(
  event: K,
  listener: (payload: NativeEvents[K]) => void,
): { remove(): void } {
  return native().addListener(event, listener as (p: never) => void);
}

type Route = {
  sub: { remove(): void };
  byId: Map<string, Set<(payload: never) => void>>;
};
const routes = new Map<string, Route>();

/**
 * One native listener per event, handed to the shell or command it names.
 * With a listener per shell, every chunk ran through every open shell.
 */
function onId<K extends keyof NativeEvents>(
  event: K,
  key: keyof NativeEvents[K],
  id: string,
  listener: (payload: NativeEvents[K]) => void,
): { remove(): void } {
  let route = routes.get(event);
  if (!route) {
    const byId: Route["byId"] = new Map();
    const sub = on(event, (e) => {
      const set = byId.get(String(e[key]));
      set?.forEach((l) => (l as (p: NativeEvents[K]) => void)(e));
    });
    route = { sub, byId };
    routes.set(event, route);
  }
  const current = route;
  let set = current.byId.get(id);
  if (!set) {
    set = new Set();
    current.byId.set(id, set);
  }
  const entry = listener as (payload: never) => void;
  set.add(entry);
  return {
    remove() {
      const ids = current.byId.get(id);
      if (!ids?.delete(entry)) return;
      if (ids.size === 0) current.byId.delete(id);
      if (current.byId.size === 0 && routes.get(event) === current) {
        current.sub.remove();
        routes.delete(event);
      }
    },
  };
}

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/** Ties an AbortSignal to a native op id, so aborting stops the work in Rust. */
async function cancellable<T>(
  opId: string,
  signal: AbortSignal | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (signal?.aborted) throw new SshError("cancelled", "Cancelled");
  const onAbort = () => native().cancel(opId);
  signal?.addEventListener("abort", onAbort);
  try {
    return await call(run);
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Listens for progress of one op while it runs. */
async function withProgress<T>(
  opId: string,
  onProgress: ((done: number, total: number) => void) | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const sub = onProgress
    ? on("onProgress", (e) => {
        if (e.opId === opId) onProgress(e.done, e.total);
      })
    : null;
  try {
    return await run();
  } finally {
    sub?.remove();
  }
}

export function engineVersion(): string | null {
  return Native?.engineVersion() ?? null;
}

/** Reads a private key, for the login editor. Throws `passphraseRequired` or `badPassphrase`. */
export function inspectKey(text: string, passphrase?: string): SshKeyInfo {
  return callSync(() => native().inspectKey(text, passphrase || null));
}

/** Turns any supported key (PuTTY PPK too) into OpenSSH text, optionally locked with a new passphrase. */
export function convertKeyToOpenssh(
  text: string,
  passphrase?: string,
  newPassphrase?: string,
): string {
  return callSync(() =>
    native().convertKeyToOpenssh(
      text,
      passphrase || null,
      newPassphrase || null,
    ),
  );
}

export function inspectCertificate(text: string): SshCertInfo {
  return callSync(() => native().inspectCertificate(text));
}

export interface ShellHandlers {
  /** Output bytes. With a `pipeId` they go to the terminal view instead, and this gets nothing. */
  onData(data: Uint8Array): void;
  /** First output of a piped shell. */
  onActive?(): void;
  onExit?(exitCode: number | null, exitSignal: string | null): void;
}

export class SshShell {
  private subs: { remove(): void }[] = [];

  constructor(
    readonly id: string,
    handlers: ShellHandlers,
  ) {
    this.subs.push(
      onId("onShellData", "shellId", id, (e) =>
        handlers.onData(fromBase64(e.data)),
      ),
      onId("onShellActive", "shellId", id, () => handlers.onActive?.()),
      onId("onShellExit", "shellId", id, (e) => {
        this.release();
        handlers.onExit?.(e.exitCode, e.exitSignal ?? null);
      }),
    );
  }

  write(data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === "string" ? utf8Encode(data) : data;
    return call(() => native().writeShell(this.id, toBase64(bytes)));
  }

  resize(cols: number, rows: number): Promise<void> {
    return call(() => native().resizeShell(this.id, cols, rows));
  }

  /** Like `INT`. Many servers ignore signals; writing Ctrl+C always works. */
  signal(name: string): Promise<void> {
    return call(() => native().signalShell(this.id, name));
  }

  async close(): Promise<void> {
    try {
      await call(() => native().closeShell(this.id));
    } finally {
      this.release();
    }
  }

  /** Stops listening without touching the channel. */
  release(): void {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }
}

export interface ExecHandlers {
  onStdout(data: Uint8Array): void;
  onStderr?(data: Uint8Array): void;
  onExit?(exitCode: number | null, exitSignal: string | null): void;
}

/** A running command whose output streams in. */
export class SshExec {
  private subs: { remove(): void }[] = [];

  constructor(
    readonly id: string,
    handlers: ExecHandlers,
  ) {
    this.subs.push(
      onId("onExecData", "execId", id, (e) => {
        const bytes = fromBase64(e.data);
        if (e.stream === "stderr") handlers.onStderr?.(bytes);
        else handlers.onStdout(bytes);
      }),
      onId("onExecExit", "execId", id, (e) => {
        this.release();
        handlers.onExit?.(e.exitCode, e.exitSignal ?? null);
      }),
    );
  }

  write(data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === "string" ? utf8Encode(data) : data;
    return call(() => native().execWrite(this.id, toBase64(bytes)));
  }

  /** Ends stdin, for commands that read until EOF. */
  eof(): Promise<void> {
    return call(() => native().execEof(this.id));
  }

  signal(name: string): Promise<void> {
    return call(() => native().execSignal(this.id, name));
  }

  async close(): Promise<void> {
    try {
      await call(() => native().execClose(this.id));
    } finally {
      this.release();
    }
  }

  release(): void {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }
}

export interface SshForward {
  id: string;
  /** The bound port: on the phone for local and dynamic, on the server for remote. */
  port: number;
  close(): Promise<void>;
}

export interface ShellOptions {
  term?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
  /** Sends output natively to the terminal view registered on this pipe, with back pressure. */
  pipeId?: string;
}

export interface ExecOptions {
  /** 0 or unset means no limit. */
  timeoutSecs?: number;
  /** Caps stdout and stderr each. Default 16 MiB. */
  maxBytes?: number;
  signal?: AbortSignal;
}

export interface TransferOptions {
  /** Resume from this byte. */
  offset?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

const DEFAULT_EXEC_MAX = 16 * 1024 * 1024;

/** SFTP on a session. The channel opens on first use and closes with the session. */
export class SshSftp {
  constructor(private readonly sessionId: string) {}

  list(path: string): Promise<SshFileEntry[]> {
    return call(() => native().sftpList(this.sessionId, path));
  }

  /** Follows symlinks. */
  stat(path: string): Promise<SshFileEntry> {
    return call(() => native().sftpStat(this.sessionId, path));
  }

  /** Describes a symlink itself, with its target. */
  lstat(path: string): Promise<SshFileEntry> {
    return call(() => native().sftpLstat(this.sessionId, path));
  }

  size(path: string): Promise<number> {
    return call(() => native().sftpSize(this.sessionId, path));
  }

  /** `.` gives the home folder. */
  realpath(path: string): Promise<string> {
    return call(() => native().sftpRealpath(this.sessionId, path));
  }

  readLink(path: string): Promise<string> {
    return call(() => native().sftpReadLink(this.sessionId, path));
  }

  /** Makes `path` a link to `target`. */
  symlink(path: string, target: string): Promise<void> {
    return call(() => native().sftpSymlink(this.sessionId, path, target));
  }

  mkdir(path: string, mode?: number): Promise<void> {
    return call(() => native().sftpMkdir(this.sessionId, path, mode ?? null));
  }

  rmdir(path: string): Promise<void> {
    return call(() => native().sftpRmdir(this.sessionId, path));
  }

  rename(from: string, to: string): Promise<void> {
    return call(() => native().sftpRename(this.sessionId, from, to));
  }

  /** Permission bits like 0o644. */
  chmod(path: string, mode: number): Promise<void> {
    return call(() => native().sftpChmod(this.sessionId, path, mode));
  }

  remove(path: string): Promise<void> {
    return call(() => native().sftpRemove(this.sessionId, path));
  }

  /** Deletes a file or folder tree, never following symlinks. Progress reports a count, total 0. */
  removeRecursive(
    path: string,
    options: Omit<TransferOptions, "offset"> = {},
  ): Promise<number> {
    const opId = newId("op");
    return withProgress(opId, options.onProgress, () =>
      cancellable(opId, options.signal, () =>
        native().sftpRemoveRecursive(this.sessionId, opId, path),
      ),
    );
  }

  /** Reads a small file. Fails when it is over `maxBytes`. */
  async readFile(path: string, maxBytes = 1024 * 1024): Promise<Uint8Array> {
    const data = await call(() =>
      native().sftpReadFile(this.sessionId, path, maxBytes),
    );
    return fromBase64(data);
  }

  /** Replaces a whole file. `mode` applies to new files. */
  writeFile(
    path: string,
    data: Uint8Array | string,
    mode?: number,
  ): Promise<void> {
    const bytes = typeof data === "string" ? utf8Encode(data) : data;
    return call(() =>
      native().sftpWriteFile(
        this.sessionId,
        path,
        toBase64(bytes),
        mode ?? null,
      ),
    );
  }

  /** Streams a remote file to a local path or file:// URI. */
  download(
    remote: string,
    local: string,
    options: TransferOptions = {},
  ): Promise<SshTransferResult> {
    const opId = newId("op");
    return withProgress(opId, options.onProgress, () =>
      cancellable(opId, options.signal, () =>
        native().sftpDownload(
          this.sessionId,
          opId,
          remote,
          local,
          options.offset ?? 0,
        ),
      ),
    );
  }

  upload(
    local: string,
    remote: string,
    options: TransferOptions = {},
  ): Promise<SshTransferResult> {
    const opId = newId("op");
    return withProgress(opId, options.onProgress, () =>
      cancellable(opId, options.signal, () =>
        native().sftpUpload(
          this.sessionId,
          opId,
          local,
          remote,
          options.offset ?? 0,
        ),
      ),
    );
  }
}

function decodeExec(r: NativeExecResult): SshExecResult {
  return {
    stdout: fromBase64(r.stdout),
    stderr: fromBase64(r.stderr),
    exitCode: r.exitCode,
    exitSignal: r.exitSignal ?? null,
    truncated: r.truncated ?? false,
  };
}

function forwardHandle(id: string, port: number): SshForward {
  return { id, port, close: () => call(() => native().closeForward(id)) };
}

export interface ConnectOptions {
  signal?: AbortSignal;
}

export class SshSession {
  readonly sftp: SshSftp;
  private disconnectListeners = new Set<(info: SshDisconnect) => void>();
  private sub: { remove(): void } | null;

  constructor(
    readonly id: string,
    public hostKey: SshHostKey,
    public algorithms: SshAlgorithms | null,
  ) {
    this.sftp = new SshSftp(id);
    this.sub = on("onDisconnect", (e) => {
      if (e.sessionId !== id) return;
      const info = { kind: e.kind ?? "network", reason: e.reason };
      this.disconnectListeners.forEach((l) => l(info));
    });
  }

  get isClosed(): boolean {
    return native().isClosed(this.id);
  }

  /** Fires every time the connection drops, including after a reconnect. */
  onDisconnect(listener: (info: SshDisconnect) => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  /** Logs in to another host through this one (a jump host hop). */
  connectVia(
    config: SshConnectConfig,
    prompts: SshPrompts,
    options: ConnectOptions = {},
  ): Promise<SshSession> {
    return connectSession(config, prompts, this.id, options);
  }

  /**
   * Logs in again with the login kept in native memory, so secrets are not sent again.
   * Shells, forwards and SFTP from before are gone; open them again.
   */
  async reconnect(
    prompts: SshPrompts,
    options: ConnectOptions = {},
  ): Promise<void> {
    const info = await withPrompts(this.id, prompts, () =>
      cancellable(this.id, options.signal, () => native().reconnect(this.id)),
    );
    this.hostKey = info.hostKey;
    this.algorithms = info.algorithms;
  }

  async exec(
    command: string,
    options: ExecOptions = {},
  ): Promise<SshExecResult> {
    const opId = newId("op");
    const r = await cancellable(opId, options.signal, () =>
      native().exec(
        this.id,
        opId,
        command,
        options.timeoutSecs ?? 0,
        options.maxBytes ?? DEFAULT_EXEC_MAX,
      ),
    );
    return decodeExec(r);
  }

  /** Starts a command and streams its output. With `pty` it gets a terminal. */
  async execStream(
    command: string,
    handlers: ExecHandlers,
    pty?: { term?: string; cols: number; rows: number },
  ): Promise<SshExec> {
    const exec = new SshExec(newId("exec"), handlers);
    try {
      await call(() =>
        native().execStream(
          this.id,
          exec.id,
          command,
          pty ? { term: pty.term ?? "xterm-256color", ...pty } : null,
        ),
      );
    } catch (err) {
      exec.release();
      throw err;
    }
    return exec;
  }

  async openShell(
    options: ShellOptions,
    handlers: ShellHandlers,
  ): Promise<SshShell> {
    const shell = new SshShell(newId("shell"), handlers);
    try {
      await call(() =>
        native().openShell(
          this.id,
          shell.id,
          options.term ?? "xterm-256color",
          options.cols,
          options.rows,
          options.env ?? {},
          options.pipeId ?? null,
        ),
      );
    } catch (err) {
      shell.release();
      throw err;
    }
    return shell;
  }

  forwardLocal(
    bindPort: number,
    remoteHost: string,
    remotePort: number,
    bindHost = "127.0.0.1",
  ): Promise<SshForward> {
    const id = newId("fwd");
    return call(() =>
      native().forwardLocal(
        this.id,
        id,
        bindHost,
        bindPort,
        remoteHost,
        remotePort,
      ),
    ).then((port) => forwardHandle(id, port));
  }

  /** A SOCKS5 proxy on the phone that opens every connection through SSH. */
  forwardDynamic(
    bindPort: number,
    bindHost = "127.0.0.1",
  ): Promise<SshForward> {
    const id = newId("fwd");
    return call(() =>
      native().forwardDynamic(this.id, id, bindHost, bindPort),
    ).then((port) => forwardHandle(id, port));
  }

  /** The server listens on `remotePort` (0 lets it pick) and sends connections to the phone's side. */
  forwardRemote(
    remotePort: number,
    localHost: string,
    localPort: number,
    remoteBindHost = "127.0.0.1",
  ): Promise<SshForward> {
    const id = newId("fwd");
    return call(() =>
      native().forwardRemote(
        this.id,
        id,
        remoteBindHost,
        remotePort,
        localHost,
        localPort,
      ),
    ).then((port) => forwardHandle(id, port));
  }

  /** Sends a keepalive and waits for the reply, handy after coming back to the foreground. */
  ping(timeoutSecs = 10): Promise<void> {
    return call(() => native().ping(this.id, timeoutSecs));
  }

  /** Closes the connection and frees everything native keeps for it. */
  async disconnect(): Promise<void> {
    try {
      await call(() => native().disconnect(this.id));
    } finally {
      this.release();
    }
  }

  private release(): void {
    this.sub?.remove();
    this.sub = null;
    this.disconnectListeners.clear();
  }
}

// Prompt answers are tied to one login of one session, by request id.
async function withPrompts<T>(
  sessionId: string,
  prompts: SshPrompts,
  run: () => Promise<T>,
): Promise<T> {
  const n = native();
  const subs = [
    on("onHostKey", (e) => {
      if (e.sessionId !== sessionId) return;
      prompts.verifyHostKey(e.hostKey).then(
        (ok) => n.answerHostKey(e.requestId, ok),
        () => n.answerHostKey(e.requestId, false),
      );
    }),
    on("onKeyboardInteractive", (e) => {
      if (e.sessionId !== sessionId) return;
      prompts.keyboardInteractive(e.request).then(
        (answers) => n.answerKeyboardInteractive(e.requestId, answers),
        () => n.answerKeyboardInteractive(e.requestId, null),
      );
    }),
    on("onBanner", (e) => {
      if (e.sessionId === sessionId) prompts.onBanner?.(e.banner);
    }),
  ];
  try {
    return await run();
  } finally {
    subs.forEach((s) => s.remove());
  }
}

async function connectSession(
  config: SshConnectConfig,
  prompts: SshPrompts,
  parentSessionId: string | null,
  options: ConnectOptions,
): Promise<SshSession> {
  const id = newId("ssh");
  const info: NativeSessionInfo = await withPrompts(id, prompts, () =>
    cancellable(id, options.signal, () =>
      native().connect(id, config, parentSessionId),
    ),
  );
  return new SshSession(id, info.hostKey, info.algorithms);
}

/** Opens a connection, checks the host key and logs in. */
export function connect(
  config: SshConnectConfig,
  prompts: SshPrompts,
  options: ConnectOptions = {},
): Promise<SshSession> {
  return connectSession(config, prompts, null, options);
}

export interface TelnetOptions {
  dial: SshDialConfig;
  cols: number;
  rows: number;
  term?: string;
  /** Typed at the first login and password prompts. */
  username?: string;
  password?: string;
  /** Reach the Telnet host through this SSH session, like a jump host. */
  via?: SshSession;
  /** Send output to a terminal view's pipe instead of `onData`. */
  pipeId?: string;
}

/** Opens a Telnet session. It is driven like a shell: write, resize, close. */
export async function connectTelnet(
  options: TelnetOptions,
  handlers: ShellHandlers,
): Promise<SshShell> {
  const shell = new SshShell(newId("telnet"), handlers);
  try {
    await call(() =>
      native().openTelnet(
        shell.id,
        options.dial,
        options.term ?? "xterm-256color",
        options.cols,
        options.rows,
        { username: options.username, password: options.password },
        options.via?.id ?? null,
        options.pipeId ?? null,
      ),
    );
  } catch (err) {
    shell.release();
    throw err;
  }
  return shell;
}

/** The remote desktop protocols this build of the engine has. */
export function displayProtocols(): DisplayProtocol[] {
  return Native?.displayProtocols?.() ?? [];
}

export interface DisplayHandlers {
  onResize?(width: number, height: number): void;
  onClipboard?(text: string): void;
  /** `reason` is null when this side closed it. */
  onClosed?(reason: string | null): void;
}

/**
 * A VNC or RDP session. Pixels go to the native display view with the same id as `frameId`;
 * this only sends input and hears size, clipboard and the end.
 */
export class RemoteDisplay {
  private subs: { remove(): void }[] = [];

  constructor(
    readonly frameId: string,
    handlers: DisplayHandlers,
  ) {
    this.subs.push(
      on("onDisplayResize", (e) => {
        if (e.displayId === frameId) handlers.onResize?.(e.width, e.height);
      }),
      on("onDisplayClipboard", (e) => {
        if (e.displayId === frameId) handlers.onClipboard?.(e.text);
      }),
      on("onDisplayClosed", (e) => {
        if (e.displayId !== frameId) return;
        this.release();
        handlers.onClosed?.(e.reason ?? null);
      }),
    );
  }

  /** Buttons: 1 left, 2 middle, 4 right, 8 wheel up, 16 wheel down. */
  pointer(x: number, y: number, buttons: number): void {
    native().displayPointer(
      this.frameId,
      Math.round(x),
      Math.round(y),
      buttons,
    );
  }

  keySym(sym: number, down: boolean): void {
    native().displayKeySym(this.frameId, sym, down);
  }

  /** Types text, one character at a time. */
  type(text: string): void {
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp == null) continue;
      native().displayUnicode(this.frameId, cp, true);
      native().displayUnicode(this.frameId, cp, false);
    }
  }

  clipboard(text: string): void {
    native().displayClipboard(this.frameId, text);
  }

  resize(width: number, height: number, scale = 0): void {
    native().displayResize(this.frameId, width, height, scale);
  }

  refresh(): void {
    native().displayRefresh(this.frameId);
  }

  close(): void {
    native().closeDisplay(this.frameId);
    this.release();
  }

  release(): void {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }
}

/** Connects and logs in to a VNC or RDP host. A refused login throws `auth`. */
export async function openDisplay(
  config: DisplayConfig,
  handlers: DisplayHandlers,
  via?: SshSession,
): Promise<RemoteDisplay> {
  const display = new RemoteDisplay(newId("display"), handlers);
  try {
    await call(() =>
      native().openDisplay(display.frameId, config, via?.id ?? null),
    );
  } catch (err) {
    display.release();
    throw err;
  }
  return display;
}
