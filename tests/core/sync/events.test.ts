import { EventStreamParser, openEventStream } from "@/core/sync/events";
import { clearFakeNet, fakeNet } from "../../helpers/net";
import { exchange } from "../../helpers/syncServer";

afterEach(clearFakeNet);

test("the recorded stream reads as one ready event", () => {
  const parser = new EventStreamParser();
  const text = exchange("events-after-push").response.body as string;
  expect(parser.push(text)).toEqual([{ event: "ready", data: "{}" }]);
});

test("events split across chunks, comments and CRLF", () => {
  const parser = new EventStreamParser();
  expect(parser.push(": ping\n\nevent: cha")).toEqual([]);
  expect(parser.push("nge\r\ndata: {}\r\n\r\nevent: change\n")).toEqual([
    { event: "change", data: "{}" },
  ]);
  expect(parser.push("data: a\ndata: b\n\n")).toEqual([
    { event: "change", data: "a\nb" },
  ]);
});

function bodyOf(chunks: string[]) {
  const encoded = chunks.map((c) => new TextEncoder().encode(c));
  return {
    getReader: () => ({
      read: async () =>
        encoded.length
          ? { done: false, value: encoded.shift()! }
          : { done: true, value: undefined },
    }),
  };
}

test("a fetch stream delivers events, then says it closed", async () => {
  const events: string[] = [];
  const closed = new Promise<{ status?: number }>((resolve) => {
    openEventStream({
      url: "https://h/sync/v2/events",
      headers: { Authorization: "Bearer t" },
      native: false,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        expect((init.headers as Record<string, string>).Authorization).toBe(
          "Bearer t",
        );
        return {
          ok: true,
          status: 200,
          body: bodyOf([
            "event: ready\ndata: {}\n\n",
            "event: change\ndata: {}\n\n",
          ]),
        };
      }) as unknown as typeof fetch,
      onEvent: (e) => events.push(e.event),
      onClose: resolve,
    });
  });
  expect(await closed).toEqual({ status: 200 });
  expect(events).toEqual(["ready", "change"]);
});

test("a refused stream closes with its status", async () => {
  const reason = await new Promise((resolve) =>
    openEventStream({
      url: "u",
      headers: {},
      native: false,
      fetchImpl: (async () => ({
        ok: false,
        status: 401,
        body: null,
      })) as never,
      onEvent: () => {},
      onClose: resolve,
    }),
  );
  expect(reason).toEqual({ status: 401 });
});

test("on iOS with a certificate the native stream is used", () => {
  const net = fakeNet({ nativeRequests: true });
  const events: string[] = [];
  const closes: unknown[] = [];
  const close = openEventStream({
    url: "https://h/sync/v2/events",
    headers: { A: "1" },
    native: true,
    onEvent: (e) => events.push(e.event),
    onClose: (r) => closes.push(r),
  });
  const [id] = (net.startStream as jest.Mock).mock.calls[0];
  net.emit("onStream", { id, type: "response", status: 200, headers: {} });
  net.emit("onStream", {
    id,
    type: "data",
    chunk: "event: change\ndata: {}\n\n",
  });
  expect(events).toEqual(["change"]);
  close();
  net.emit("onStream", { id, type: "end" });
  expect(closes).toEqual([]);
});
