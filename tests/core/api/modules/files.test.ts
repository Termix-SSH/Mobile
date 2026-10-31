import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../../helpers/http";
import { clearFakeNet, fakeNet } from "../../../helpers/net";

beforeEach(resetStorage);

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

async function client(generation: "plugin" | "legacy" = "plugin") {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://termix.example/base/",
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", generation);
  await c.load();
  await c.setToken("tok");
  return c;
}

function fakeFetch(reply: { status?: number; json?: unknown }) {
  const calls: { url: string; init: any }[] = [];
  global.fetch = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const status = reply.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => reply.json ?? {},
    } as Response;
  }) as any;
  return calls;
}

test("stream downloads post to the plugin route with Range when resuming", async () => {
  const c = await client();
  const calls = fakeFetch({ status: 206 });
  await c.api.files.downloadStream("sid", "/var/log/a", 100);
  expect(calls[0].url).toBe(
    "https://termix.example/base/plugin-api/file-manager/downloadFileStream",
  );
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.headers.Range).toBe("bytes=100-");
  expect(calls[0].init.headers.Authorization).toBe("Bearer tok");
  expect(JSON.parse(calls[0].init.body)).toEqual({
    sessionId: "sid",
    path: "/var/log/a",
  });
  await c.api.files.downloadStream("sid", "/a", 0);
  expect(calls[1].init.headers.Range).toBeUndefined();
});

test("older servers get the legacy stream path", async () => {
  const c = await client("legacy");
  expect(c.api.files.streamUrl("uploadFileChunk")).toBe(
    "https://termix.example/base/ssh/file_manager/ssh/uploadFileChunk",
  );
});

test("chunks go as raw bytes with their offset", async () => {
  const c = await client();
  const calls = fakeFetch({ json: { nextOffset: 7, complete: true } });
  const bytes = new Uint8Array([1, 2, 3]);
  const next = await c.api.files.uploadChunk("sid", "/srv", "a b", 4, 7, bytes);
  expect(next).toEqual({ nextOffset: 7, complete: true });
  const url = new URL(calls[0].url);
  expect(url.pathname).toBe("/base/plugin-api/file-manager/uploadFileChunk");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    sessionId: "sid",
    path: "/srv",
    fileName: "a b",
    offset: "4",
    totalSize: "7",
  });
  expect(calls[0].init.body).toBe(bytes);
  expect(calls[0].init.headers["Content-Type"]).toBe(
    "application/octet-stream",
  );
});

test("a failed stream throws the server's message", async () => {
  const c = await client();
  fakeFetch({ status: 400, json: { error: "Cannot download directories" } });
  await expect(c.api.files.downloadStream("sid", "/d", 0)).rejects.toThrow(
    "Cannot download directories",
  );
});

describe("with a client certificate on iOS", () => {
  afterEach(clearFakeNet);

  async function certClient() {
    const net = fakeNet({ nativeRequests: true });
    const c = await client();
    await c.setClientCert({ base64: "AAAA", passphrase: "pw", name: null });
    global.fetch = jest.fn(() => {
      throw new Error("fetch can't send the certificate");
    }) as any;
    return { net, c };
  }

  test("downloads stream through the native module as bytes", async () => {
    const { net, c } = await certClient();
    const pending = c.api.files.downloadStream("sid", "/a", 5);
    const [id, request] = (net.startStream as jest.Mock).mock.calls[0];
    expect(request).toMatchObject({ method: "POST", binary: true });
    expect(request.headers.Range).toBe("bytes=5-");
    net.emit("onStream", {
      id,
      type: "response",
      status: 206,
      headers: { "content-length": "3" },
    });
    const res = await pending;
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Length")).toBe("3");
    const reader = res.body!.getReader();
    net.emit("onStream", { id, type: "data", chunk: "AQID" });
    net.emit("onStream", { id, type: "end" });
    expect(await reader.read()).toEqual({
      done: false,
      value: new Uint8Array([1, 2, 3]),
    });
    expect((await reader.read()).done).toBe(true);
  });

  test("a failed download still reads the server's error", async () => {
    const { net, c } = await certClient();
    const pending = c.api.files.downloadStream("sid", "/a", 0);
    const [id] = (net.startStream as jest.Mock).mock.calls[0];
    net.emit("onStream", { id, type: "response", status: 404, headers: {} });
    net.emit("onStream", {
      id,
      type: "data",
      chunk: Buffer.from('{"error":"gone"}').toString("base64"),
    });
    net.emit("onStream", { id, type: "end" });
    await expect(pending).rejects.toThrow("gone");
  });

  test("upload chunks go as base64 through the native module", async () => {
    const { net, c } = await certClient();
    net.reply = () => ({
      status: 200,
      headers: {},
      body: JSON.stringify({ nextOffset: 3, complete: true }),
      url: "",
    });
    const next = await c.api.files.uploadChunk(
      "sid",
      "/srv",
      "a",
      0,
      3,
      new Uint8Array([1, 2, 3]),
    );
    expect(next).toEqual({ nextOffset: 3, complete: true });
    expect(net.requests[0]).toMatchObject({
      method: "POST",
      bodyBase64: "AQID",
    });
  });
});
