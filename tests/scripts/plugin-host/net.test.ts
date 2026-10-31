/**
 * @jest-environment jsdom
 */
import type {
  AppMessage,
  PageMessage,
} from "../../../src/core/plugins/frame-protocol";

// jsdom leaves out the fetch types; the WebView has them. Set before undici loads.
const util = require("node:util");
const web = require("node:stream/web");
Object.assign(globalThis, {
  TextEncoder: util.TextEncoder,
  TextDecoder: util.TextDecoder,
  ReadableStream: web.ReadableStream,
  TransformStream: web.TransformStream,
  WritableStream: web.WritableStream,
  Blob: require("node:buffer").Blob,
});
const { Headers, Request, Response } = require("undici");
Object.assign(globalThis, { Headers, Request, Response });

const { base64ToBytes, bytesToBase64, createNet } =
  require("../../../scripts/plugin-host/net") as typeof import("../../../scripts/plugin-host/net");

const origin = "https://termix.example";

function setup() {
  const sent: PageMessage[] = [];
  const local = jest.fn(async () => new Response("local"));
  const net = createNet(origin, (m) => sent.push(m), local as never);
  const reply = (m: AppMessage) => net.receive(m);
  const text = (id: string, status: number, body: string) => {
    reply({
      t: "http.head",
      id,
      status,
      headers: { "content-type": "application/json" },
    });
    reply({
      t: "http.chunk",
      id,
      base64: bytesToBase64(new TextEncoder().encode(body)),
    });
    reply({ t: "http.end", id });
  };
  return { net, sent, local, reply, text };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test("base64 round trip", () => {
  const bytes = new Uint8Array([0, 1, 254, 255]);
  expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
});

test("fetch to the server becomes a message and a streamed response", async () => {
  const { net, sent, text } = setup();
  const pending = net.fetch("/plugin-api/alerts/items?x=1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"a":1}',
  });
  await flush();
  const msg = sent[0] as Extract<PageMessage, { t: "http" }>;
  expect(msg).toMatchObject({
    t: "http",
    method: "POST",
    url: `${origin}/plugin-api/alerts/items?x=1`,
  });
  expect(msg.headers["content-type"]).toBe("application/json");
  expect(
    new TextDecoder().decode(
      base64ToBytes((msg.body as { value: string }).value),
    ),
  ).toBe('{"a":1}');
  text(msg.id, 201, '{"ok":true}');
  const res = await pending;
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ ok: true });
});

test("other origins are refused, data and blob URLs stay local", async () => {
  const { net, sent, local } = setup();
  await expect(net.fetch("https://evil.example/x")).rejects.toThrow(
    "Blocked by the app",
  );
  await net.fetch("data:text/plain,hi");
  expect(local).toHaveBeenCalled();
  expect(sent).toHaveLength(0);
});

test("a stream keeps delivering chunks until it ends", async () => {
  const { net, sent, reply } = setup();
  const pending = net.fetch("/plugin-api/alerts/stream");
  await flush();
  const id = (sent[0] as { id: string }).id;
  reply({
    t: "http.head",
    id,
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
  const res = await pending;
  const reader = res.body!.getReader();
  reply({
    t: "http.chunk",
    id,
    base64: bytesToBase64(new TextEncoder().encode("data: 1\n\n")),
  });
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toBe("data: 1\n\n");
  reply({ t: "http.end", id });
  expect((await reader.read()).done).toBe(true);
});

test("aborting tells the app, and a failure before the head rejects", async () => {
  const { net, sent, reply } = setup();
  const controller = new AbortController();
  const aborted = net.fetch("/plugin-api/alerts/slow", {
    signal: controller.signal,
  });
  await flush();
  controller.abort();
  await expect(aborted).rejects.toThrow();
  expect(sent.map((m) => m.t)).toEqual(["http", "http.abort"]);

  const failed = net.fetch("/plugin-api/alerts/x");
  await flush();
  reply({
    t: "http.end",
    id: (sent[2] as { id: string }).id,
    error: "offline",
  });
  await expect(failed).rejects.toThrow("offline");
});

test("XMLHttpRequest works the way axios uses it", async () => {
  const { net, sent, text } = setup();
  const xhr = new net.XMLHttpRequest();
  const done = new Promise<void>((resolve) => {
    xhr.onloadend = () => resolve();
  });
  xhr.open("GET", "/rbac/permissions/me");
  xhr.setRequestHeader("Accept", "application/json");
  xhr.send();
  await flush();
  const msg = sent[0] as Extract<PageMessage, { t: "http" }>;
  expect(msg.headers.accept).toBe("application/json");
  text(msg.id, 200, '{"isAdmin":true}');
  await done;
  expect(xhr.readyState).toBe(4);
  expect(xhr.status).toBe(200);
  expect(xhr.responseText).toBe('{"isAdmin":true}');
  expect(xhr.getResponseHeader("Content-Type")).toBe("application/json");
});

test("XMLHttpRequest reports network errors", async () => {
  const { net, sent, reply } = setup();
  const xhr = new net.XMLHttpRequest();
  const events: string[] = [];
  xhr.onerror = () => events.push("error");
  const done = new Promise<void>((resolve) => {
    xhr.onloadend = () => resolve();
  });
  xhr.open("GET", "/users/me");
  xhr.send();
  await flush();
  reply({ t: "http.end", id: (sent[0] as { id: string }).id, error: "down" });
  await done;
  expect(events).toEqual(["error"]);
  expect(xhr.status).toBe(0);
});

test("WebSocket goes through the app both ways", () => {
  const { net, sent, reply } = setup();
  const socket = new net.WebSocket(
    "wss://termix.example/plugin-ws/x/live",
    "termix.jwt.t",
  );
  const got: unknown[] = [];
  socket.onopen = () => got.push("open");
  socket.onmessage = (e) => got.push(e.data);
  socket.onclose = (e) => got.push(`close ${e.code}`);
  const open = sent[0] as Extract<PageMessage, { t: "ws.open" }>;
  expect(open).toMatchObject({
    t: "ws.open",
    url: "wss://termix.example/plugin-ws/x/live",
    protocols: ["termix.jwt.t"],
  });
  reply({ t: "ws.open", id: open.id, protocol: "termix.jwt.t" });
  expect(socket.readyState).toBe(1);
  socket.send("hello");
  reply({ t: "ws.message", id: open.id, body: { kind: "text", value: "hi" } });
  reply({ t: "ws.close", id: open.id, code: 1000, reason: "" });
  expect(sent[1]).toEqual({
    t: "ws.send",
    id: open.id,
    body: { kind: "text", value: "hello" },
  });
  expect(got).toEqual(["open", "hi", "close 1000"]);
  expect(socket.readyState).toBe(3);
});

test("a WebSocket to another host closes at once", async () => {
  const { net, sent } = setup();
  const socket = new net.WebSocket("wss://evil.example/x");
  const closed = new Promise<number>((resolve) => {
    socket.onclose = (e) => resolve(e.code);
  });
  expect(await closed).toBe(1006);
  expect(sent).toHaveLength(0);
});
