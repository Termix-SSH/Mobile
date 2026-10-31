import {
  needsSocketBridge,
  SocketBridge,
  SOCKET_SHIM_SCRIPT,
  type BridgeEvent,
} from "@/features/remote-desktop/tunnel-bridge";

function fakeSocket() {
  return {
    send: jest.fn(),
    close: jest.fn(),
    readyState: 0,
    protocol: "guacamole",
    onopen: null as any,
    onmessage: null as any,
    onclose: null as any,
    onerror: null as any,
  };
}

function setup(patch: Record<string, unknown> = {}) {
  const socket = fakeSocket();
  const client = {
    rootBase: () => "https://termix.example",
    openSocket: jest.fn(() => socket),
    clientCert: () => null,
    getProxy: () => ({ customHeaders: [], basicAuth: null }),
    proxyCookies: () => [],
    ...patch,
  } as any;
  const events: BridgeEvent[] = [];
  const bridge = new SocketBridge(client, (e) => events.push(e));
  return { client, socket, events, bridge };
}

test("only a certificate, proxy headers, basic auth or proxy cookies need the bridge", () => {
  expect(needsSocketBridge(setup().client)).toBe(false);
  expect(
    needsSocketBridge(setup({ clientCert: () => ({ name: "p" }) }).client),
  ).toBe(true);
  expect(
    needsSocketBridge(
      setup({
        getProxy: () => ({
          customHeaders: [{ name: "CF-Access-Client-Id", value: "x" }],
          basicAuth: null,
        }),
      }).client,
    ),
  ).toBe(true);
  expect(
    needsSocketBridge(
      setup({ proxyCookies: () => [{ name: "a", value: "b" }] }).client,
    ),
  ).toBe(true);
});

test("opens the page's socket through the account and passes everything back", () => {
  const { client, socket, events, bridge } = setup();
  const url = "wss://termix.example/plugin-ws/remote-desktop/display?token=t?";
  expect(
    bridge.handle({
      type: "ws.open",
      id: "ws0",
      url,
      protocols: ["guacamole"],
    }),
  ).toBe(true);
  expect(client.openSocket).toHaveBeenCalledWith(url, ["guacamole"]);
  socket.onopen();
  socket.onmessage({ data: "4.sync,1.0;" });
  bridge.handle({ type: "ws.send", id: "ws0", data: "3.nop;" });
  expect(socket.send).toHaveBeenCalledWith("3.nop;");
  socket.onclose({ code: 1000, reason: "" });
  expect(events).toEqual([
    { id: "ws0", t: "open", protocol: "guacamole" },
    { id: "ws0", t: "message", data: "4.sync,1.0;" },
    { id: "ws0", t: "close", code: 1000, reason: "" },
  ]);
});

test("a socket to another server is refused", () => {
  const { client, events, bridge } = setup();
  bridge.handle({ type: "ws.open", id: "x", url: "wss://evil.example/x" });
  expect(client.openSocket).not.toHaveBeenCalled();
  expect(events[0]).toMatchObject({ t: "close", code: 1008 });
});

test("other page messages are left alone, closeAll closes quietly", () => {
  const { socket, events, bridge } = setup();
  expect(bridge.handle({ type: "state" })).toBe(false);
  bridge.handle({
    type: "ws.open",
    id: "a",
    url: "wss://termix.example/x",
  });
  bridge.closeAll();
  expect(socket.close).toHaveBeenCalled();
  expect(socket.onclose).toBeNull();
  expect(events).toEqual([]);
});

test("the page shim stands in for WebSocket and talks to the app", () => {
  const posted: any[] = [];
  const win: any = {
    ReactNativeWebView: {
      postMessage: (m: string) => posted.push(JSON.parse(m)),
    },
  };
  new Function("window", SOCKET_SHIM_SCRIPT)(win);
  const ws = new win.WebSocket("wss://termix.example/x", "guacamole");
  expect(posted[0]).toEqual({
    type: "ws.open",
    id: "ws0",
    url: "wss://termix.example/x",
    protocols: ["guacamole"],
  });
  const seen: string[] = [];
  ws.onopen = () => seen.push("open");
  ws.onmessage = (e: any) => seen.push(e.data);
  ws.send("early");
  win.__termixWs({ id: "ws0", t: "open", protocol: "guacamole" });
  win.__termixWs({ id: "ws0", t: "message", data: "hi" });
  ws.send("x");
  ws.close();
  expect(seen).toEqual(["open", "hi"]);
  expect(posted.slice(1)).toEqual([
    { type: "ws.send", id: "ws0", data: "x" },
    { type: "ws.close", id: "ws0", code: 1000, reason: "" },
  ]);
  expect(win.WebSocket.OPEN).toBe(1);
});
