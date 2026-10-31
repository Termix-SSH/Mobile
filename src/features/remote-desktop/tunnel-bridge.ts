import type { AccountClient, SocketLike } from "@/core/api/AccountClient";
import { toWebSocketBase } from "@/core/api/compat/api-compat";

/**
 * A web view can't send a client certificate on iOS, proxy headers anywhere,
 * or cookies from the app's own jar. With any of those, the Guacamole socket
 * goes through the app instead.
 */
export function needsSocketBridge(client: AccountClient): boolean {
  const proxy = client.getProxy();
  return (
    !!client.clientCert() ||
    proxy.customHeaders.length > 0 ||
    !!proxy.basicAuth ||
    client.proxyCookies().length > 0
  );
}

/**
 * Swaps WebSocket in the page for one that asks the app to open the socket.
 * Must run before Guacamole connects.
 */
export const SOCKET_SHIM_SCRIPT = `
(function () {
  var sockets = {};
  var next = 0;
  var post = function (p) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(p));
  };
  function BridgeSocket(url, protocols) {
    this.url = url;
    this.readyState = 0;
    this.protocol = '';
    this.binaryType = 'blob';
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    this._id = 'ws' + next++;
    sockets[this._id] = this;
    post({ type: 'ws.open', id: this._id, url: url, protocols: protocols ? [].concat(protocols) : [] });
  }
  BridgeSocket.CONNECTING = BridgeSocket.prototype.CONNECTING = 0;
  BridgeSocket.OPEN = BridgeSocket.prototype.OPEN = 1;
  BridgeSocket.CLOSING = BridgeSocket.prototype.CLOSING = 2;
  BridgeSocket.CLOSED = BridgeSocket.prototype.CLOSED = 3;
  BridgeSocket.prototype.send = function (data) {
    if (this.readyState !== 1) return;
    post({ type: 'ws.send', id: this._id, data: String(data) });
  };
  BridgeSocket.prototype.close = function (code, reason) {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    post({ type: 'ws.close', id: this._id, code: code || 1000, reason: reason || '' });
  };
  window.__termixWs = function (e) {
    var s = sockets[e.id];
    if (!s) return;
    if (e.t === 'open') {
      s.readyState = 1;
      s.protocol = e.protocol || '';
      s.onopen && s.onopen({});
    } else if (e.t === 'message') {
      s.onmessage && s.onmessage({ data: e.data });
    } else if (e.t === 'error') {
      s.onerror && s.onerror({ message: e.message });
    } else if (e.t === 'close') {
      s.readyState = 3;
      delete sockets[e.id];
      s.onclose && s.onclose({ code: e.code, reason: e.reason || '', wasClean: e.code === 1000 });
    }
  };
  window.WebSocket = BridgeSocket;
})();
`;

export type BridgeEvent =
  | { id: string; t: "open"; protocol: string }
  | { id: string; t: "message"; data: string }
  | { id: string; t: "error"; message: string }
  | { id: string; t: "close"; code: number; reason: string };

/**
 * The app side of SOCKET_SHIM_SCRIPT: opens the sockets the page asks for
 * through the account, so they carry its certificate, headers and cookies.
 */
export class SocketBridge {
  private sockets = new Map<string, SocketLike>();

  constructor(
    private client: AccountClient,
    private deliver: (event: BridgeEvent) => void,
  ) {}

  /** Handles a page message. False when it isn't a socket message. */
  handle(payload: {
    type?: string;
    id?: string;
    url?: string;
    protocols?: unknown;
    data?: unknown;
    code?: number;
    reason?: string;
  }): boolean {
    const id = String(payload.id ?? "");
    switch (payload.type) {
      case "ws.open":
        this.open(id, String(payload.url ?? ""), payload.protocols);
        return true;
      case "ws.send":
        this.sockets.get(id)?.send(String(payload.data ?? ""));
        return true;
      case "ws.close":
        this.sockets.get(id)?.close(payload.code ?? 1000, payload.reason ?? "");
        return true;
      default:
        return false;
    }
  }

  closeAll(): void {
    for (const socket of this.sockets.values()) {
      socket.onclose = null;
      socket.close();
    }
    this.sockets.clear();
  }

  private open(id: string, url: string, protocols: unknown) {
    // Only this server's own sockets.
    if (!url.startsWith(`${toWebSocketBase(this.client.rootBase())}/`)) {
      this.deliver({
        id,
        t: "close",
        code: 1008,
        reason: "Blocked by the app",
      });
      return;
    }
    const list = Array.isArray(protocols)
      ? protocols.filter((p): p is string => typeof p === "string")
      : [];
    let socket: SocketLike;
    try {
      socket = this.client.openSocket(url, list);
    } catch (error) {
      this.deliver({ id, t: "error", message: String(error) });
      this.deliver({ id, t: "close", code: 1006, reason: "" });
      return;
    }
    this.sockets.set(id, socket);
    socket.onopen = () =>
      this.deliver({
        id,
        t: "open",
        protocol: String((socket as { protocol?: string }).protocol ?? ""),
      });
    socket.onmessage = (event: { data: unknown }) =>
      this.deliver({ id, t: "message", data: String(event.data) });
    socket.onerror = (event: unknown) =>
      this.deliver({
        id,
        t: "error",
        message: String((event as { message?: string })?.message ?? "error"),
      });
    socket.onclose = (event: { code?: number; reason?: string }) => {
      this.sockets.delete(id);
      this.deliver({
        id,
        t: "close",
        code: event.code ?? 1006,
        reason: event.reason ?? "",
      });
    };
  }
}
