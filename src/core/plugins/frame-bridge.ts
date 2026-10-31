import type { AccountClient, SocketLike } from "@/core/api/AccountClient";
import { USER_AGENT } from "@/core/api/http";
import { fromBase64, toBase64, utf8Decode, utf8Encode } from "@/core/db/bytes";
import { nativeStream } from "@/modules/termix-net";
import { checkRequest, checkSocket, pageHeaders } from "./bridge-policy";
import type {
  AppMessage,
  FrameBody,
  PageMessage,
  ShellCall,
} from "./frame-protocol";

export interface FrameBridgeOptions {
  client: AccountClient;
  pluginId: string;
  /** Sends a message into the page. */
  send: (message: AppMessage) => void;
  onShell: (call: ShellCall, args: unknown[]) => void;
  onLink: (url: string) => void;
  onLoaded: (views: { tabs: string[]; panels: string[] }) => void;
  onFailed: (reason: "link" | "activate" | "view", message: string) => void;
  onBackResult: (handled: boolean) => void;
  log?: (level: "info" | "warn" | "error", message: string) => void;
}

const CHUNK = 64 * 1024;

function bodyBytes(body: FrameBody): Uint8Array | null {
  if (body.kind === "text") return utf8Encode(body.value);
  if (body.kind === "base64") return fromBase64(body.value);
  return null;
}

function headersOf(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name] = value;
  });
  return out;
}

/**
 * Runs what a plugin page asks for: requests and sockets through the
 * account's client (login, proxy headers, client certificate), checked
 * against the plugin's allow list first, and shell calls handed to the screen.
 */
export class FrameBridge {
  private readonly requests = new Map<string, () => void>();
  private readonly sockets = new Map<string, SocketLike>();
  private disposed = false;

  constructor(private readonly options: FrameBridgeOptions) {}

  handle(message: PageMessage): void {
    if (this.disposed) return;
    const o = this.options;
    switch (message.t) {
      case "http":
        void this.http(message);
        break;
      case "http.abort":
        this.requests.get(message.id)?.();
        this.requests.delete(message.id);
        break;
      case "ws.open":
        this.openSocket(message.id, message.url, message.protocols);
        break;
      case "ws.send":
        this.sendSocket(message.id, message.body);
        break;
      case "ws.close":
        this.sockets.get(message.id)?.close(message.code, message.reason);
        break;
      case "shell":
        o.onShell(
          message.call,
          Array.isArray(message.args) ? message.args : [],
        );
        break;
      case "link":
        if (typeof message.url === "string") o.onLink(message.url);
        break;
      case "loaded":
        o.onLoaded({ tabs: message.tabs ?? [], panels: message.panels ?? [] });
        break;
      case "failed":
        o.onFailed(message.reason, String(message.message ?? ""));
        break;
      case "back.result":
        o.onBackResult(!!message.handled);
        break;
      case "log":
        o.log?.(message.level, String(message.message ?? ""));
        break;
      default:
        // Anything not on the list is dropped.
        break;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const abort of this.requests.values()) abort();
    this.requests.clear();
    for (const socket of this.sockets.values()) {
      try {
        socket.close();
      } catch {
        // Already gone.
      }
    }
    this.sockets.clear();
  }

  private send(message: AppMessage) {
    if (!this.disposed) this.options.send(message);
  }

  private refuse(id: string, status: number, error: string) {
    const body = utf8Encode(JSON.stringify({ error }));
    this.send({
      t: "http.head",
      id,
      status,
      headers: { "content-type": "application/json" },
    });
    this.send({ t: "http.chunk", id, base64: toBase64(body) });
    this.send({ t: "http.end", id });
  }

  private async http(message: Extract<PageMessage, { t: "http" }>) {
    const { client, pluginId, log } = this.options;
    const { id } = message;
    const check = checkRequest(
      pluginId,
      client.rootBase(),
      message.method,
      message.url,
    );
    if (!check.ok) {
      log?.("warn", `Blocked ${check.reason}`);
      this.refuse(id, 403, "The app does not let plugins use this route.");
      return;
    }
    const headers: Record<string, string> = {
      ...pageHeaders(message.headers ?? {}),
      ...client.sessionHeaders(),
      "User-Agent": USER_AGENT,
    };
    const bytes = bodyBytes(message.body ?? { kind: "none" });

    // iOS with a client certificate: only the module can present it.
    if (client.usesNativeNetwork()) {
      const wantsStream =
        message.method.toUpperCase() === "GET" &&
        /text\/event-stream/i.test(headers.accept ?? headers.Accept ?? "");
      if (wantsStream) {
        this.nativeStreamRequest(id, message.url, headers);
        return;
      }
    }

    const controller = new AbortController();
    this.requests.set(id, () => controller.abort());
    try {
      let body: BodyInit | undefined;
      if (bytes) {
        // The certificate path sends text only, like the app's own requests.
        body = client.usesNativeNetwork()
          ? utf8Decode(bytes)
          : (bytes as unknown as BodyInit);
      }
      const response = await client.fetch(message.url, {
        method: message.method,
        headers,
        body,
        signal: controller.signal,
      });
      // Core answers 503 for a plugin that was turned off.
      if (response.status === 503) void client.refreshEnabledPlugins();
      this.send({
        t: "http.head",
        id,
        status: response.status,
        headers: headersOf(response.headers),
      });
      const reader = response.body?.getReader?.();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || this.disposed || !this.requests.has(id)) break;
          for (let i = 0; i < value.length; i += CHUNK) {
            this.send({
              t: "http.chunk",
              id,
              base64: toBase64(value.subarray(i, i + CHUNK)),
            });
          }
        }
      } else {
        const all = new Uint8Array(await response.arrayBuffer());
        for (let i = 0; i < all.length; i += CHUNK) {
          this.send({
            t: "http.chunk",
            id,
            base64: toBase64(all.subarray(i, i + CHUNK)),
          });
        }
      }
      this.send({ t: "http.end", id });
    } catch (error) {
      this.send({
        t: "http.end",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.requests.delete(id);
    }
  }

  private nativeStreamRequest(
    id: string,
    url: string,
    headers: Record<string, string>,
  ) {
    const { client } = this.options;
    const stop = nativeStream(
      { url, headers: { ...client.proxyHeaders(), ...headers } },
      {
        onResponse: (status, responseHeaders) =>
          this.send({ t: "http.head", id, status, headers: responseHeaders }),
        onData: (chunk) =>
          this.send({
            t: "http.chunk",
            id,
            base64: toBase64(utf8Encode(chunk)),
          }),
        onEnd: (error) => {
          this.requests.delete(id);
          this.send({ t: "http.end", id, error });
        },
      },
    );
    this.requests.set(id, stop);
  }

  private openSocket(id: string, url: string, protocols: string[]) {
    const { client, pluginId, log } = this.options;
    const check = checkSocket(pluginId, client.rootBase(), url);
    if (!check.ok) {
      log?.("warn", `Blocked socket ${check.reason}`);
      this.send({
        t: "ws.close",
        id,
        code: 1008,
        reason: "Blocked by the app",
      });
      return;
    }
    let socket: SocketLike;
    try {
      socket = client.openSocket(
        url,
        (protocols ?? []).filter((p) => typeof p === "string"),
      );
    } catch (error) {
      this.send({ t: "ws.error", id, message: String(error) });
      this.send({ t: "ws.close", id, code: 1006, reason: "" });
      return;
    }
    (socket as { binaryType?: string }).binaryType = "arraybuffer";
    this.sockets.set(id, socket);
    socket.onopen = () =>
      this.send({
        t: "ws.open",
        id,
        protocol: String((socket as { protocol?: string }).protocol ?? ""),
      });
    socket.onmessage = (event: { data: unknown }) => {
      const data = event.data;
      const body: FrameBody =
        typeof data === "string"
          ? { kind: "text", value: data }
          : {
              kind: "base64",
              value: toBase64(new Uint8Array(data as ArrayBuffer)),
            };
      this.send({ t: "ws.message", id, body });
    };
    socket.onerror = (event: unknown) =>
      this.send({
        t: "ws.error",
        id,
        message: String((event as { message?: string })?.message ?? "error"),
      });
    socket.onclose = (event: { code?: number; reason?: string }) => {
      this.sockets.delete(id);
      this.send({
        t: "ws.close",
        id,
        code: event?.code ?? 1006,
        reason: event?.reason ?? "",
      });
    };
  }

  private sendSocket(id: string, body: FrameBody) {
    const socket = this.sockets.get(id);
    if (!socket || !body) return;
    if (body.kind === "text") socket.send(body.value);
    else if (body.kind === "base64") {
      socket.send(fromBase64(body.value).buffer as ArrayBuffer);
    }
  }
}
