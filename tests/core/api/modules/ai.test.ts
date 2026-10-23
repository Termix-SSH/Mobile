import { ReadableStream as NodeReadableStream } from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";
import { AccountClient } from "@/core/api/AccountClient";
import { createAiApi, AiApiError } from "@/core/api/modules/ai";
import { USER_AGENT } from "@/core/api/http";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../../helpers/http";

const ReadableStream =
  NodeReadableStream as unknown as typeof globalThis.ReadableStream;
const decoderDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "TextDecoder",
);
const root = "https://termix.example/base";
const status = {
  globallyEnabled: true,
  enabled: true,
  allowReadOnlyCommands: true,
};

beforeEach(resetStorage);
beforeAll(() => {
  Object.defineProperty(globalThis, "TextDecoder", {
    configurable: true,
    value: TextDecoder,
  });
});
afterAll(() => {
  if (decoderDescriptor)
    Object.defineProperty(globalThis, "TextDecoder", decoderDescriptor);
  else Reflect.deleteProperty(globalThis, "TextDecoder");
});
afterEach(() => jest.restoreAllMocks());

async function pluginClient(
  plugins: unknown[] = [{ id: "ai", enabled: true, state: "active" }],
) {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: `${root}/ssh/`,
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", "plugin");
  await c.storage.data.setJson("enabledPlugins", plugins);
  await c.load();
  return c;
}

function streamResponse(
  body: ReadableStream<Uint8Array> | null,
  httpStatus = 200,
  contentType = "text/event-stream; charset=utf-8",
  data: unknown = {},
) {
  return {
    ok: httpStatus >= 200 && httpStatus < 300,
    status: httpStatus,
    headers: { get: () => contentType },
    body,
    json: async () => data,
  } as unknown as Response;
}

const input = {
  conversationId: "9",
  providerId: "2",
  model: "test-model",
  message: "Hello",
};

test("unavailable plugins and legacy servers need no request", async () => {
  const seen = fakeServer(() => ({ data: status }));
  const c = await pluginClient([{ id: "ssh-terminal" }]);
  expect(c.api.ai.isAiAvailable()).toBe(false);
  expect(await c.api.ai.getAccess()).toEqual({ state: "not-installed" });
  const legacy = new AccountClient({
    accountId: "b",
    serverUrl: root,
    storage: accountStorage("b"),
  });
  expect(await legacy.api.ai.getAccess()).toEqual({ state: "not-installed" });
  expect(seen).toEqual([]);
});

test.each([
  [status, { state: "ready", allowReadOnlyCommands: true }],
  [
    { ...status, enabled: false, allowReadOnlyCommands: false },
    { state: "needs-opt-in", allowReadOnlyCommands: false },
  ],
  [{ ...status, globallyEnabled: false }, { state: "disabled-globally" }],
  [{ unexpected: true }, { state: "error", message: "Unexpected response" }],
  ["<!doctype html><html></html>", { state: "not-installed" }],
])("reads access from status %j at the server root", async (data, expected) => {
  const seen = fakeServer(() => ({ data }));
  const c = await pluginClient();
  expect(c.api.ai.isAiAvailable()).toBe(true);
  expect(await c.api.ai.getAccess()).toEqual(expected);
  expect(seen[0]).toMatchObject({
    method: "GET",
    url: `${root}/plugin-api/ai/status`,
  });
});

test.each([
  [401, { error: "Expired" }, { state: "signed-out" }],
  [403, { error: "Denied" }, { state: "forbidden" }],
  [404, { error: "Missing" }, { state: "not-installed" }],
  [
    500,
    { error: "AI unavailable" },
    { state: "error", message: "AI unavailable" },
  ],
])(
  "maps status HTTP %s and reports expired auth",
  async (httpStatus, data, expected) => {
    fakeServer(() => ({ status: httpStatus, data }));
    const c = await pluginClient();
    const notify = jest.spyOn(c, "notifyAuthLost").mockImplementation(() => {});
    expect(await c.api.ai.getAccess()).toEqual(expected);
    expect(notify).toHaveBeenCalledTimes(httpStatus === 401 ? 1 : 0);
  },
);

test("network errors become access errors", async () => {
  fakeServer(() => new Error("Offline"));
  const c = await pluginClient();
  expect(await c.api.ai.getAccess()).toEqual({
    state: "error",
    message: "Offline",
  });
});

test.each([true, false])(
  "opt-in PUT sends enabled %s and refreshes access",
  async (enabled) => {
    const seen = fakeServer(() => ({ data: { ...status, enabled } }));
    const c = await pluginClient();
    expect(await c.api.ai.optIn(enabled)).toEqual({
      state: enabled ? "ready" : "needs-opt-in",
      allowReadOnlyCommands: true,
    });
    expect(seen).toMatchObject([
      { method: "PUT", url: `${root}/plugin-api/ai/opt-in`, data: { enabled } },
      { method: "GET", url: `${root}/plugin-api/ai/status` },
    ]);
  },
);

test("opt-in forbidden with a message means globally disabled", async () => {
  const seen = fakeServer(() => ({
    status: 403,
    data: { error: "AI disabled" },
  }));
  const c = await pluginClient();
  expect(await c.api.ai.optIn(true)).toEqual({ state: "disabled-globally" });
  expect(seen).toHaveLength(1);
});

test("providers and conversations use the existing parsers", async () => {
  const seen = fakeServer((req) => {
    if (req.url.endsWith("/providers"))
      return {
        data: {
          providers: [
            { id: 2, providerType: "ollama", apiKey: "secret" },
            { id: "bad" },
          ],
        },
      };
    if (req.url.endsWith("/conversations"))
      return { data: { conversations: [{ id: 9 }] } };
    return { data: { conversation: { id: 9 }, messages: [], proposals: [] } };
  });
  const c = await pluginClient();
  const providers = await c.api.ai.listProviders();
  expect(providers).toHaveLength(1);
  expect(providers[0]).toMatchObject({ id: 2, providerType: "ollama" });
  expect(providers[0]).not.toHaveProperty("apiKey");
  expect(await c.api.ai.listConversations()).toMatchObject([{ id: 9 }]);
  expect(await c.api.ai.getConversation(9)).toMatchObject({
    conversation: { id: 9 },
    messages: [],
    proposals: [],
  });
  await c.api.ai.deleteConversation("9/a");
  expect(seen.map(({ method, url }) => ({ method, url }))).toEqual([
    { method: "GET", url: `${root}/plugin-api/ai/providers` },
    { method: "GET", url: `${root}/plugin-api/ai/conversations` },
    { method: "GET", url: `${root}/plugin-api/ai/conversations/9` },
    { method: "DELETE", url: `${root}/plugin-api/ai/conversations/9%2Fa` },
  ]);
});

test("apply and reject proposals use their action URLs", async () => {
  const seen = fakeServer(() => ({
    data: { success: true, summary: "Applied", extra: "ignored" },
  }));
  const c = await pluginClient();
  expect(await c.api.ai.applyProposal(7)).toEqual({
    success: true,
    summary: "Applied",
  });
  await c.api.ai.rejectProposal("8/a");
  expect(seen).toMatchObject([
    { method: "POST", url: `${root}/plugin-api/ai/proposals/7/apply` },
    { method: "POST", url: `${root}/plugin-api/ai/proposals/8%2Fa/reject` },
  ]);
});

test.each([
  "listProviders",
  "listConversations",
  "getConversation",
  "deleteConversation",
  "applyProposal",
  "rejectProposal",
  "optIn",
] as const)(
  "%s reports 401 as an AiApiError and notifies auth loss",
  async (method) => {
    fakeServer(() => ({ status: 401, data: { error: "Session expired" } }));
    const c = await pluginClient();
    const notify = jest.spyOn(c, "notifyAuthLost").mockImplementation(() => {});
    const call =
      method === "optIn" ? c.api.ai.optIn(true) : c.api.ai[method]("7");
    await expect(call).rejects.toBeInstanceOf(AiApiError);
    await expect(call).rejects.toMatchObject({
      status: 401,
      message: "Session expired",
    });
    expect(notify).toHaveBeenCalledTimes(1);
  },
);

test("malformed resource responses throw AiApiError", async () => {
  fakeServer(() => ({ data: {} }));
  const c = await pluginClient();
  await expect(c.api.ai.listProviders()).rejects.toMatchObject({
    name: "AiApiError",
    message: "Unexpected response",
  });
});

test("streaming delivers split SSE frames in order and sends auth and proxy headers", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of [
        'data: {"type":"conver',
        'sation","conversationId":9}\n\ndata: {"type":"token","text":"Pří',
        'liš 🙂"}\n\ndata: {"type":"done"}\n',
        "\n",
      ]) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  const fetchMock = jest.fn(async () => streamResponse(stream));
  const c = await pluginClient();
  jest.spyOn(c, "token").mockReturnValue("test-token");
  jest
    .spyOn(c, "proxyHeaders")
    .mockReturnValue({ "X-Proxy-Token": "proxy-token" });
  const events: unknown[] = [];
  const controller = new AbortController();
  await createAiApi(c, { fetch: fetchMock }).streamChat(
    input,
    (event) => events.push(event),
    controller.signal,
  );
  expect(events).toEqual([
    { type: "conversation", conversationId: 9 },
    { type: "token", text: "Příliš 🙂" },
    { type: "done" },
  ]);
  expect(fetchMock).toHaveBeenCalledWith(`${root}/plugin-api/ai/chat/stream`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "X-Proxy-Token": "proxy-token",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(input),
    signal: controller.signal,
  });
  expect(stream.locked).toBe(false);
});

test.each([401, 404])(
  "stream HTTP %s surfaces server messages and notifies auth loss",
  async (httpStatus) => {
    const c = await pluginClient();
    const notify = jest.spyOn(c, "notifyAuthLost").mockImplementation(() => {});
    const message =
      httpStatus === 401 ? "Session expired" : "Provider not found";
    const fetchMock = jest.fn(async () =>
      streamResponse(null, httpStatus, "application/json", { error: message }),
    );
    const result = createAiApi(c, { fetch: fetchMock }).streamChat(
      input,
      jest.fn(),
      new AbortController().signal,
    );
    await expect(result).rejects.toBeInstanceOf(AiApiError);
    await expect(result).rejects.toMatchObject({ status: httpStatus, message });
    expect(notify).toHaveBeenCalledTimes(httpStatus === 401 ? 1 : 0);
  },
);

test.each(["application/json", "text/event-stream"])(
  "invalid stream response %s is rejected",
  async (contentType) => {
    const c = await pluginClient();
    const body =
      contentType === "application/json"
        ? new ReadableStream<Uint8Array>()
        : null;
    const fetchMock = jest.fn(async () =>
      streamResponse(body, 200, contentType),
    );
    await expect(
      createAiApi(c, { fetch: fetchMock }).streamChat(
        input,
        jest.fn(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      name: "AiApiError",
      message: "Unexpected response",
    });
  },
);

test("aborting a pending stream rejects with AbortError and cancels the reader", async () => {
  const cancel = jest.fn();
  const stream = new ReadableStream<Uint8Array>({ cancel });
  const fetchMock = jest.fn(async () => streamResponse(stream));
  const c = await pluginClient();
  const controller = new AbortController();
  const onEvent = jest.fn();
  const result = createAiApi(c, { fetch: fetchMock }).streamChat(
    input,
    onEvent,
    controller.signal,
  );
  await Promise.resolve();
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(onEvent).not.toHaveBeenCalled();
  expect(stream.locked).toBe(false);
});
