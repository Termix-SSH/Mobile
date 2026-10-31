import type { AccountClient } from "@/core/api/AccountClient";
import { fromBase64, toBase64, utf8Decode, utf8Encode } from "@/core/db/bytes";
import { FrameBridge } from "@/core/plugins/frame-bridge";
import type { AppMessage } from "@/core/plugins/frame-protocol";

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  readyState = 0;
  protocol = "termix.jwt.t";
  sent: unknown[] = [];
  constructor(
    public url: string,
    public protocols: string[],
  ) {}
  send(data: unknown) {
    this.sent.push(data);
  }
  close(code = 1000, reason = "") {
    this.onclose?.({ code, reason });
  }
}

function setup(reply?: (url: string, init: RequestInit) => Response) {
  const fetches: { url: string; init: RequestInit }[] = [];
  const sockets: FakeSocket[] = [];
  const client = {
    accountId: "a",
    rootBase: () => "https://termix.example",
    sessionHeaders: () => ({ Authorization: "Bearer secret" }),
    proxyHeaders: () => ({ "CF-Access-Client-Id": "id" }),
    usesNativeNetwork: () => false,
    refreshEnabledPlugins: jest.fn(async () => {}),
    fetch: jest.fn(async (url: string, init: RequestInit) => {
      fetches.push({ url, init });
      return reply
        ? reply(url, init)
        : new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
    }),
    openSocket: jest.fn((url: string, protocols: string[]) => {
      const socket = new FakeSocket(url, protocols);
      sockets.push(socket);
      return socket;
    }),
  } as unknown as AccountClient;
  const sent: AppMessage[] = [];
  const shell: unknown[][] = [];
  const events: string[] = [];
  const bridge = new FrameBridge({
    client,
    pluginId: "alerts",
    send: (m) => sent.push(m),
    onShell: (call, args) => shell.push([call, ...args]),
    onLink: (url) => events.push(`link ${url}`),
    onLoaded: (views) => events.push(`loaded ${views.tabs.join(",")}`),
    onFailed: (reason) => events.push(`failed ${reason}`),
    onBackResult: (handled) => events.push(`back ${handled}`),
  });
  return { bridge, client, fetches, sockets, sent, shell, events };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function bodyOf(sent: AppMessage[], id: string): string {
  return sent
    .filter(
      (m): m is Extract<AppMessage, { t: "http.chunk" }> =>
        m.t === "http.chunk" && m.id === id,
    )
    .map((m) => utf8Decode(fromBase64(m.base64)))
    .join("");
}

test("allowed requests go out with the app's login, not the page's", async () => {
  const { bridge, fetches, sent } = setup();
  bridge.handle({
    t: "http",
    id: "h1",
    method: "POST",
    url: "https://termix.example/plugin-api/alerts/items/read",
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer from-page",
    },
    body: { kind: "base64", value: toBase64(utf8Encode('{"all":true}')) },
  });
  await flush();
  await flush();
  expect(fetches).toHaveLength(1);
  const headers = fetches[0].init.headers as Record<string, string>;
  expect(headers.Authorization).toBe("Bearer secret");
  expect(headers["content-type"]).toBe("application/json");
  expect(utf8Decode(fetches[0].init.body as unknown as Uint8Array)).toBe(
    '{"all":true}',
  );
  expect(sent[0]).toMatchObject({ t: "http.head", id: "h1", status: 200 });
  expect(bodyOf(sent, "h1")).toBe('{"ok":true}');
  expect(sent.at(-1)).toEqual({ t: "http.end", id: "h1" });
});

test("a 503 from a turned off plugin reloads the plugin list", async () => {
  const { bridge, client, sent } = setup(
    () => new Response(JSON.stringify({ pluginId: "alerts" }), { status: 503 }),
  );
  bridge.handle({
    t: "http",
    id: "h9",
    method: "GET",
    url: "https://termix.example/plugin-api/alerts/items",
    headers: {},
    body: { kind: "none" },
  });
  await flush();
  await flush();
  expect(client.refreshEnabledPlugins).toHaveBeenCalled();
  expect(sent[0]).toMatchObject({ t: "http.head", id: "h9", status: 503 });
});

test("refused requests answer 403 without reaching the server", async () => {
  const { bridge, fetches, sent } = setup();
  bridge.handle({
    t: "http",
    id: "h2",
    method: "GET",
    url: "https://termix.example/users/list",
    headers: {},
    body: { kind: "none" },
  });
  await flush();
  expect(fetches).toHaveLength(0);
  expect(sent[0]).toMatchObject({ t: "http.head", id: "h2", status: 403 });
  expect(JSON.parse(bodyOf(sent, "h2")).error).toMatch(/does not let/);
});

test("a network failure ends the request with the error", async () => {
  const { bridge, sent } = setup(() => {
    throw new Error("offline");
  });
  bridge.handle({
    t: "http",
    id: "h3",
    method: "GET",
    url: "https://termix.example/plugin-api/alerts/items",
    headers: {},
    body: { kind: "none" },
  });
  await flush();
  expect(sent).toEqual([{ t: "http.end", id: "h3", error: "offline" }]);
});

test("sockets open through the client and carry text and bytes both ways", () => {
  const { bridge, sockets, sent } = setup();
  bridge.handle({
    t: "ws.open",
    id: "w1",
    url: "wss://termix.example/plugin-ws/alerts/live",
    protocols: ["termix.jwt.t"],
  });
  const socket = sockets[0];
  expect(socket.protocols).toEqual(["termix.jwt.t"]);
  socket.onopen?.();
  socket.onmessage?.({ data: "hi" });
  socket.onmessage?.({ data: new Uint8Array([1, 2]).buffer });
  bridge.handle({
    t: "ws.send",
    id: "w1",
    body: { kind: "text", value: "yo" },
  });
  bridge.handle({
    t: "ws.send",
    id: "w1",
    body: { kind: "base64", value: toBase64(new Uint8Array([9])) },
  });
  bridge.handle({ t: "ws.close", id: "w1", code: 1000 });
  expect(sent).toEqual([
    { t: "ws.open", id: "w1", protocol: "termix.jwt.t" },
    { t: "ws.message", id: "w1", body: { kind: "text", value: "hi" } },
    {
      t: "ws.message",
      id: "w1",
      body: { kind: "base64", value: toBase64(new Uint8Array([1, 2])) },
    },
    { t: "ws.close", id: "w1", code: 1000, reason: "" },
  ]);
  expect(socket.sent[0]).toBe("yo");
  expect(new Uint8Array(socket.sent[1] as ArrayBuffer)).toEqual(
    new Uint8Array([9]),
  );
});

test("a socket to another plugin is closed before it opens", () => {
  const { bridge, sockets, sent } = setup();
  bridge.handle({
    t: "ws.open",
    id: "w2",
    url: "wss://termix.example/plugin-ws/docker/console",
    protocols: [],
  });
  expect(sockets).toHaveLength(0);
  expect(sent).toEqual([
    { t: "ws.close", id: "w2", code: 1008, reason: "Blocked by the app" },
  ]);
});

test("page events reach the screen, unknown messages are dropped", () => {
  const { bridge, shell, events } = setup();
  bridge.handle({ t: "loaded", tabs: ["alerts"], panels: [] });
  bridge.handle({ t: "shell", call: "connectHost", args: ["7"] });
  bridge.handle({ t: "link", url: "https://docs.termix.site" });
  bridge.handle({ t: "back.result", handled: true });
  bridge.handle({ t: "failed", reason: "link", message: "x" });
  bridge.handle({ t: "nope" } as never);
  expect(shell).toEqual([["connectHost", "7"]]);
  expect(events).toEqual([
    "loaded alerts",
    "link https://docs.termix.site",
    "back true",
    "failed link",
  ]);
});

test("dispose closes sockets and ignores what comes after", () => {
  const { bridge, sockets, sent } = setup();
  bridge.handle({
    t: "ws.open",
    id: "w3",
    url: "wss://termix.example/plugin-ws/alerts/live",
    protocols: [],
  });
  bridge.dispose();
  expect(sent).toEqual([]);
  bridge.handle({
    t: "ws.open",
    id: "w4",
    url: "wss://termix.example/plugin-ws/alerts/live",
    protocols: [],
  });
  expect(sockets).toHaveLength(1);
});
