import {
  setNativeNet,
  type NetCookie,
  type NetResponse,
  type TermixNetNative,
} from "@/modules/termix-net";

type Listener = (event: any) => void;

export interface FakeNet extends TermixNetNative {
  certs: Map<string, string>;
  /** Pins per host, as the native store keeps them. */
  pins: Map<string, string[]>;
  /** The key a peek at any server reads. */
  serverKey: string;
  cookies: Map<string, NetCookie[]>;
  webCookies: NetCookie[];
  /** What the app's own request jar holds. */
  jarCookies: NetCookie[];
  cleared: [string, string][];
  requests: Parameters<NonNullable<TermixNetNative["request"]>>[0][];
  emit(event: "onStream" | "onSocket", body: unknown): void;
  reply: (req: { url: string }) => NetResponse;
}

/** An in-memory termix-net module. `nativeRequests` is iOS behavior. */
export function fakeNet(options: { nativeRequests?: boolean } = {}): FakeNet {
  const listeners = new Map<string, Set<Listener>>();
  const net: FakeNet = {
    nativeRequests: options.nativeRequests ?? false,
    certs: new Map(),
    pins: new Map(),
    serverKey: "S".repeat(43) + "=",
    async setServerPins(host, pins) {
      if (pins.length) net.pins.set(host, pins);
      else net.pins.delete(host);
    },
    async peekServerKey() {
      return {
        pin: net.serverKey,
        subject: "CN=termix",
        issuer: "CN=termix",
        notAfter: null,
        selfSigned: true,
      };
    },
    cookies: new Map(),
    webCookies: [],
    jarCookies: [],
    cleared: [],
    requests: [],
    reply: () => ({ status: 200, headers: {}, body: "{}", url: "" }),
    async importClientCert(accountId, host, pfx, passphrase) {
      if (passphrase === "wrong") {
        throw Object.assign(new Error("bad"), { code: "BAD_PASSPHRASE" });
      }
      net.certs.set(accountId, host);
      return { subject: "CN=phone", notAfter: null };
    },
    async removeClientCert(accountId) {
      net.certs.delete(accountId);
    },
    async hasClientCert(accountId) {
      return net.certs.has(accountId);
    },
    async readWebCookies() {
      return net.webCookies;
    },
    async readJarCookies() {
      return net.jarCookies;
    },
    async setCookies(url, cookies) {
      net.cookies.set(url, cookies);
    },
    async clearCookie(url, name) {
      net.cleared.push([url, name]);
    },
    async clearWebCookies() {
      net.webCookies = [];
    },
    async request(req) {
      net.requests.push(req);
      return net.reply(req);
    },
    startStream: jest.fn(),
    cancelStream: jest.fn(),
    openSocket: jest.fn(),
    sendSocket: jest.fn(),
    closeSocket: jest.fn(),
    addListener(event: string, fn: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return { remove: () => listeners.get(event)?.delete(fn) };
    },
    emit(event, body) {
      listeners.get(event)?.forEach((fn) => fn(body));
    },
  } as FakeNet;
  setNativeNet(net);
  return net;
}

export function clearFakeNet(): void {
  setNativeNet(null);
}
