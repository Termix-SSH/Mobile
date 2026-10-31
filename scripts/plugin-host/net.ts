// Replaces fetch, XMLHttpRequest and WebSocket in the plugin page. Requests
// to the server go to the app as messages; the app adds the login, proxy
// headers and client certificate. The page itself has no network (CSP).

import type {
  AppMessage,
  FrameBody,
  PageMessage,
} from "../../src/core/plugins/frame-protocol";

type Send = (message: PageMessage) => void;

interface Pending {
  head(status: number, headers: Record<string, string>): void;
  chunk(bytes: Uint8Array): void;
  end(error?: string): void;
}

let counter = 0;
const nextId = (kind: string) => `${kind}${++counter}`;

export function base64ToBytes(base64: string): Uint8Array {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(raw);
}

async function bodyOf(request: Request): Promise<FrameBody> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { kind: "none" };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return { kind: "none" };
  return { kind: "base64", value: bytesToBase64(bytes) };
}

function headersOf(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name] = value;
  });
  return out;
}

export interface NetBridge {
  receive(message: AppMessage): boolean;
  fetch: typeof fetch;
  XMLHttpRequest: typeof XMLHttpRequest;
  WebSocket: typeof WebSocket;
}

/**
 * Builds the replacements. `origin` is the server's; anything else is
 * refused, except data: and blob: URLs, which `localFetch` serves.
 */
export function createNet(
  origin: string,
  send: Send,
  localFetch: typeof fetch,
): NetBridge {
  const pending = new Map<string, Pending>();
  const sockets = new Map<string, FrameSocket>();

  const isServer = (url: URL) => url.origin === origin;
  const resolve = (input: string) => new URL(input, `${origin}/`);

  function request(
    req: Request,
    signal: AbortSignal | null | undefined,
    handlers: Pending,
  ): void {
    const id = nextId("h");
    pending.set(id, handlers);
    if (signal) {
      const abort = () => {
        if (!pending.delete(id)) return;
        send({ t: "http.abort", id });
        handlers.end("aborted");
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    }
    void bodyOf(req).then(
      (body) =>
        send({
          t: "http",
          id,
          method: req.method,
          url: req.url,
          headers: headersOf(req.headers),
          body,
        }),
      (error) => {
        pending.delete(id);
        handlers.end(String(error));
      },
    );
  }

  const bridgeFetch: typeof fetch = (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = resolve(href);
    if (url.protocol === "data:" || url.protocol === "blob:") {
      return localFetch(input, init);
    }
    if (!isServer(url)) {
      return Promise.reject(new TypeError("Blocked by the app"));
    }
    const req =
      input instanceof Request && !init ? input : new Request(url.href, init);
    return new Promise<Response>((resolveResponse, reject) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
      let started = false;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      });
      request(
        req,
        init?.signal ?? (input instanceof Request ? input.signal : null),
        {
          head(status, headers) {
            started = true;
            const nullBody = status === 204 || status === 304;
            resolveResponse(
              new Response(nullBody ? null : stream, {
                status,
                headers,
              }),
            );
          },
          chunk(bytes) {
            controller?.enqueue(bytes);
          },
          end(error) {
            if (!started) {
              reject(new TypeError(error ?? "Network request failed"));
              return;
            }
            try {
              if (error) controller?.error(new TypeError(error));
              else controller?.close();
            } catch {
              // Already closed by a reader that gave up.
            }
          },
        },
      );
    });
  };

  class FrameXhr extends EventTarget {
    static readonly UNSENT = 0;
    static readonly OPENED = 1;
    static readonly HEADERS_RECEIVED = 2;
    static readonly LOADING = 3;
    static readonly DONE = 4;
    readonly UNSENT = 0;
    readonly OPENED = 1;
    readonly HEADERS_RECEIVED = 2;
    readonly LOADING = 3;
    readonly DONE = 4;

    readyState = 0;
    status = 0;
    statusText = "";
    responseType: XMLHttpRequestResponseType = "";
    response: unknown = null;
    responseText = "";
    responseURL = "";
    timeout = 0;
    withCredentials = false;
    upload = new EventTarget();

    onreadystatechange: ((event: Event) => void) | null = null;
    onload: ((event: Event) => void) | null = null;
    onloadend: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onabort: ((event: Event) => void) | null = null;
    ontimeout: ((event: Event) => void) | null = null;

    private method = "GET";
    private url = "";
    private headers = new Headers();
    private responseHeaders: Record<string, string> = {};
    private controller: AbortController | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;

    open(method: string, url: string | URL): void {
      this.method = method.toUpperCase();
      this.url = resolve(String(url)).href;
      this.headers = new Headers();
      this.setState(1);
    }

    setRequestHeader(name: string, value: string): void {
      this.headers.set(name, value);
    }

    getResponseHeader(name: string): string | null {
      return this.responseHeaders[name.toLowerCase()] ?? null;
    }

    getAllResponseHeaders(): string {
      return Object.entries(this.responseHeaders)
        .map(([name, value]) => `${name}: ${value}`)
        .join("\r\n");
    }

    overrideMimeType(): void {}

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      const controller = new AbortController();
      this.controller = controller;
      if (this.timeout > 0) {
        this.timer = setTimeout(() => {
          controller.abort();
          this.finish("timeout");
        }, this.timeout);
      }
      bridgeFetch(this.url, {
        method: this.method,
        headers: this.headers,
        body:
          this.method === "GET" || this.method === "HEAD"
            ? undefined
            : (body as BodyInit | null | undefined),
        signal: controller.signal,
      }).then(
        async (response) => {
          this.status = response.status;
          this.statusText = response.statusText;
          this.responseURL = this.url;
          this.responseHeaders = headersOf(response.headers);
          this.setState(2);
          this.setState(3);
          const buffer = await response.arrayBuffer();
          if (this.controller !== controller) return;
          const text = () => new TextDecoder().decode(buffer);
          if (this.responseType === "arraybuffer") this.response = buffer;
          else if (this.responseType === "blob") {
            this.response = new Blob([buffer], {
              type: response.headers.get("content-type") ?? "",
            });
          } else if (this.responseType === "json") {
            try {
              this.response = JSON.parse(text());
            } catch {
              this.response = null;
            }
          } else {
            this.responseText = text();
            this.response = this.responseText;
          }
          this.finish("load");
        },
        () => {
          if (this.controller === controller) this.finish("error");
        },
      );
    }

    abort(): void {
      if (!this.controller) return;
      this.controller.abort();
      this.finish("abort");
    }

    private setState(state: number) {
      this.readyState = state;
      this.fire("readystatechange");
    }

    private finish(kind: "load" | "error" | "abort" | "timeout") {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.controller = null;
      if (kind !== "load") this.status = 0;
      this.setState(4);
      this.fire(kind);
      this.fire("loadend");
    }

    private fire(type: string) {
      const event = new Event(type);
      this.dispatchEvent(event);
      const handler = (this as unknown as Record<string, unknown>)[`on${type}`];
      if (typeof handler === "function") handler.call(this, event);
    }
  }

  class FrameSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readonly url: string;
    readyState = 0;
    protocol = "";
    extensions = "";
    bufferedAmount = 0;
    binaryType: BinaryType = "blob";
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    private readonly id = nextId("w");

    constructor(url: string | URL, protocols?: string | string[]) {
      super();
      const target = resolve(String(url));
      this.url = target.href;
      const wsOrigin = origin.replace(/^http/, "ws");
      if (target.origin !== wsOrigin && target.origin !== origin) {
        queueMicrotask(() => this.closed(1006, "Blocked by the app"));
        return;
      }
      sockets.set(this.id, this);
      send({
        t: "ws.open",
        id: this.id,
        url: this.url.replace(/^http/, "ws"),
        protocols: protocols
          ? Array.isArray(protocols)
            ? protocols
            : [protocols]
          : [],
      });
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      if (this.readyState !== 1) return;
      if (typeof data === "string") {
        send({
          t: "ws.send",
          id: this.id,
          body: { kind: "text", value: data },
        });
        return;
      }
      void (async () => {
        const bytes =
          data instanceof Blob
            ? new Uint8Array(await data.arrayBuffer())
            : ArrayBuffer.isView(data)
              ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
              : new Uint8Array(data as ArrayBuffer);
        send({
          t: "ws.send",
          id: this.id,
          body: { kind: "base64", value: bytesToBase64(bytes) },
        });
      })();
    }

    close(code?: number, reason?: string): void {
      if (this.readyState >= 2) return;
      this.readyState = 2;
      send({ t: "ws.close", id: this.id, code, reason });
    }

    handle(message: AppMessage): void {
      if (message.t === "ws.open") {
        this.readyState = 1;
        this.protocol = message.protocol;
        this.emit(new Event("open"), this.onopen);
      } else if (message.t === "ws.message") {
        let data: unknown = "";
        if (message.body.kind === "text") data = message.body.value;
        else if (message.body.kind === "base64") {
          const bytes = base64ToBytes(message.body.value);
          data =
            this.binaryType === "arraybuffer"
              ? bytes.buffer
              : new Blob([bytes as BlobPart]);
        }
        this.emit(new MessageEvent("message", { data }), this.onmessage);
      } else if (message.t === "ws.error") {
        this.emit(new Event("error"), this.onerror);
      } else if (message.t === "ws.close") {
        this.closed(message.code, message.reason);
      }
    }

    private closed(code: number, reason: string) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      sockets.delete(this.id);
      const event = new CloseEvent("close", {
        code,
        reason,
        wasClean: code === 1000,
      });
      this.emit(event, this.onclose);
    }

    private emit<E extends Event>(event: E, handler: ((e: E) => void) | null) {
      this.dispatchEvent(event);
      handler?.call(this, event);
    }
  }

  return {
    receive(message) {
      switch (message.t) {
        case "http.head":
          pending.get(message.id)?.head(message.status, message.headers);
          return true;
        case "http.chunk":
          pending.get(message.id)?.chunk(base64ToBytes(message.base64));
          return true;
        case "http.end": {
          const handlers = pending.get(message.id);
          pending.delete(message.id);
          handlers?.end(message.error);
          return true;
        }
        case "ws.open":
        case "ws.message":
        case "ws.close":
        case "ws.error":
          sockets.get(message.id)?.handle(message);
          return true;
        default:
          return false;
      }
    },
    fetch: bridgeFetch,
    XMLHttpRequest: FrameXhr as unknown as typeof XMLHttpRequest,
    WebSocket: FrameSocket as unknown as typeof WebSocket,
  };
}
