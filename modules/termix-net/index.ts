import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

export interface NetCookie {
  name: string;
  value: string;
  domain?: string | null;
  path?: string | null;
  /** Milliseconds since 1970. */
  expires?: number | null;
  secure?: boolean;
  httpOnly?: boolean;
}

export interface NetRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  /** A binary body, base64. Wins over `body`. */
  bodyBase64?: string | null;
  timeoutMs?: number;
  /** Streams only: send chunks as base64 instead of text. */
  binary?: boolean;
}

export interface NetResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  url: string;
}

/** What a server's certificate says, read before it is trusted. */
export interface ServerKey {
  /** base64 sha256 of the public key (SPKI), the value a pin holds. */
  pin: string;
  subject: string | null;
  issuer: string | null;
  notAfter: number | null;
  selfSigned: boolean | null;
}

export interface CertInfo {
  subject: string | null;
  /** Milliseconds since 1970, when the platform can read it. */
  notAfter: number | null;
}

type StreamEvent =
  | {
      id: string;
      type: "response";
      status: number;
      headers: Record<string, string>;
    }
  | { id: string; type: "data"; chunk: string }
  | { id: string; type: "end" }
  | { id: string; type: "error"; message: string };

type SocketEvent =
  | { id: string; type: "open"; protocol: string }
  | { id: string; type: "message"; data: string; binary: boolean }
  | { id: string; type: "close"; code: number; reason: string }
  | { id: string; type: "error"; message: string };

interface Subscription {
  remove(): void;
}

export interface TermixNetNative {
  nativeRequests: boolean;
  importClientCert(
    accountId: string,
    host: string,
    pfxBase64: string,
    passphrase: string,
  ): Promise<CertInfo>;
  removeClientCert(accountId: string): Promise<void>;
  hasClientCert(accountId: string): Promise<boolean>;
  setServerPins?(host: string, pins: string[]): Promise<void>;
  peekServerKey?(host: string, port: number): Promise<ServerKey>;
  readWebCookies(url: string): Promise<NetCookie[]>;
  readJarCookies?(url: string): Promise<NetCookie[]>;
  setCookies(url: string, cookies: NetCookie[]): Promise<void>;
  clearCookie(url: string, name: string): Promise<void>;
  clearWebCookies(url: string): Promise<void>;
  tcpProbe?(host: string, port: number, timeoutMs: number): Promise<boolean>;
  udpSend?(host: string, port: number, base64: string): Promise<void>;
  request?(request: Required<NetRequest>): Promise<NetResponse>;
  startStream?(id: string, request: Required<NetRequest>): void;
  cancelStream?(id: string): void;
  openSocket?(
    id: string,
    url: string,
    protocols: string[],
    headers: Record<string, string>,
  ): void;
  sendSocket?(id: string, text: string | null, base64: string | null): void;
  closeSocket?(id: string, code: number, reason: string): void;
  addListener(event: "onStream", fn: (e: StreamEvent) => void): Subscription;
  addListener(event: "onSocket", fn: (e: SocketEvent) => void): Subscription;
}

let native: TermixNetNative | null =
  requireOptionalNativeModule<TermixNetNative>("TermixNet");

/** Test seam. */
export function setNativeNet(next: TermixNetNative | null): void {
  native = next;
  streamSub?.remove();
  socketSub?.remove();
  streamSub = socketSub = null;
}

/** False on web, in Expo Go and in builds without the module. */
export function isNetAvailable(): boolean {
  return !!native;
}

/** True where a client certificate needs the module's own requests (iOS). */
export function needsNativeRequests(): boolean {
  return !!native?.nativeRequests && Platform.OS === "ios";
}

function need(): TermixNetNative {
  if (!native) {
    throw Object.assign(
      new Error("This build can't use client certificates."),
      {
        code: "NET_UNAVAILABLE",
      },
    );
  }
  return native;
}

export function importClientCert(
  accountId: string,
  host: string,
  pfxBase64: string,
  passphrase: string,
): Promise<CertInfo> {
  return need().importClientCert(accountId, host, pfxBase64, passphrase);
}

export async function removeClientCert(accountId: string): Promise<void> {
  await native?.removeClientCert(accountId).catch(() => {});
}

export async function hasClientCert(accountId: string): Promise<boolean> {
  return (await native?.hasClientCert(accountId).catch(() => false)) ?? false;
}

/** Pins a server's keys for every request and web view to that host. Empty unpins. */
export async function setServerPins(
  host: string,
  pins: string[],
): Promise<void> {
  await native?.setServerPins?.(host, pins);
}

/** Reads the key a server shows, without trusting it, so the user can pin it. */
export function peekServerKey(host: string, port: number): Promise<ServerKey> {
  const net = need();
  if (!net.peekServerKey) throw new Error("This build can't read server keys.");
  return net.peekServerKey(host, port);
}

export async function readWebCookies(url: string): Promise<NetCookie[]> {
  return (await native?.readWebCookies(url)) ?? [];
}

/** Cookies the app's own requests hold now, renewed ones included. */
export async function readJarCookies(url: string): Promise<NetCookie[]> {
  if (!native?.readJarCookies) return [];
  return (await native.readJarCookies(url).catch(() => [])) ?? [];
}

export async function setCookies(
  url: string,
  cookies: NetCookie[],
): Promise<void> {
  if (cookies.length) await native?.setCookies(url, cookies);
}

export async function clearCookie(url: string, name: string): Promise<void> {
  await native?.clearCookie(url, name).catch(() => {});
}

export async function clearWebCookies(url: string): Promise<void> {
  await native?.clearWebCookies(url).catch(() => {});
}

export function nativeRequest(request: NetRequest): Promise<NetResponse> {
  const net = need();
  if (!net.request) throw new Error("Native requests are iOS only.");
  return net.request({
    url: request.url,
    method: request.method ?? "GET",
    headers: request.headers ?? {},
    body: request.body ?? null,
    bodyBase64: request.bodyBase64 ?? null,
    timeoutMs: request.timeoutMs ?? 30000,
    binary: false,
  });
}

// Local network

/** True when this build can probe ports and send UDP on the local network. */
export function isLanAvailable(): boolean {
  return !!native?.tcpProbe && !!native?.udpSend;
}

/** True when a TCP connection to host:port opens within the time. */
export async function tcpProbe(
  host: string,
  port: number,
  timeoutMs = 5000,
): Promise<boolean> {
  if (!native?.tcpProbe) {
    throw Object.assign(new Error("This build can't check ports."), {
      code: "NET_UNAVAILABLE",
    });
  }
  return native.tcpProbe(host, port, timeoutMs).catch(() => false);
}

/** Sends one UDP datagram with broadcast allowed; the payload is base64. */
export function udpSend(
  host: string,
  port: number,
  base64: string,
): Promise<void> {
  if (!native?.udpSend) {
    throw Object.assign(new Error("This build can't send UDP packets."), {
      code: "NET_UNAVAILABLE",
    });
  }
  return native.udpSend(host, port, base64);
}

// Streams

let nextId = 0;
const newId = (kind: string) =>
  `${kind}-${Date.now().toString(36)}-${nextId++}`;

interface StreamHandlers {
  onResponse?(status: number, headers: Record<string, string>): void;
  onData(chunk: string): void;
  onEnd(error?: string): void;
}

const streams = new Map<string, StreamHandlers>();
let streamSub: Subscription | null = null;

/** A long running request whose body arrives in chunks (event streams). */
export function nativeStream(
  request: NetRequest,
  handlers: StreamHandlers,
): () => void {
  const net = need();
  if (!net.startStream || !net.cancelStream) {
    throw new Error("Native streams are iOS only.");
  }
  streamSub ??= net.addListener("onStream", (event) => {
    const h = streams.get(event.id);
    if (!h) return;
    if (event.type === "response") h.onResponse?.(event.status, event.headers);
    else if (event.type === "data") h.onData(event.chunk);
    else {
      streams.delete(event.id);
      h.onEnd(event.type === "error" ? event.message : undefined);
    }
  });
  const id = newId("stream");
  streams.set(id, handlers);
  net.startStream(id, {
    url: request.url,
    method: request.method ?? "GET",
    headers: request.headers ?? {},
    body: request.body ?? null,
    bodyBase64: request.bodyBase64 ?? null,
    timeoutMs: 0,
    binary: request.binary ?? false,
  });
  return () => {
    if (!streams.delete(id)) return;
    net.cancelStream?.(id);
  };
}

// Sockets

const sockets = new Map<string, NativeSocket>();
let socketSub: Subscription | null = null;

interface MessageLike {
  data: string;
}
interface CloseLike {
  code: number;
  reason: string;
  wasClean: boolean;
}

/** The parts of the WebSocket API the app uses, over the module's socket. */
export class NativeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = NativeSocket.CONNECTING;
  protocol = "";
  onopen: ((event: object) => void) | null = null;
  onmessage: ((event: MessageLike) => void) | null = null;
  onclose: ((event: CloseLike) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  private readonly id = newId("socket");

  constructor(
    url: string,
    protocols: string | string[] = [],
    headers: Record<string, string> = {},
  ) {
    const net = need();
    if (!net.openSocket) throw new Error("Native sockets are iOS only.");
    this.url = url;
    socketSub ??= net.addListener("onSocket", (event) =>
      sockets.get(event.id)?.handle(event),
    );
    sockets.set(this.id, this);
    net.openSocket(
      this.id,
      url,
      Array.isArray(protocols) ? protocols : [protocols],
      headers,
    );
  }

  private handle(event: SocketEvent): void {
    if (event.type === "open") {
      this.readyState = NativeSocket.OPEN;
      this.protocol = event.protocol;
      this.onopen?.({});
    } else if (event.type === "message") {
      this.onmessage?.({ data: event.data });
    } else if (event.type === "error") {
      this.onerror?.({ message: event.message });
    } else {
      this.readyState = NativeSocket.CLOSED;
      sockets.delete(this.id);
      this.onclose?.({
        code: event.code,
        reason: event.reason,
        wasClean: event.code === 1000,
      });
    }
  }

  send(data: string): void {
    if (this.readyState !== NativeSocket.OPEN) return;
    native?.sendSocket?.(this.id, data, null);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState >= NativeSocket.CLOSING) return;
    this.readyState = NativeSocket.CLOSING;
    native?.closeSocket?.(this.id, code, reason);
  }
}
