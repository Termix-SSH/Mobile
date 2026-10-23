import { ReadableStream as NodeReadableStream } from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";
import { readSseStream, SseParser } from "@/features/ai/sse";

// Use Node's real streams with the DOM constructor type expected by the client.
const ReadableStream =
  NodeReadableStream as unknown as typeof globalThis.ReadableStream;
const decoderDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "TextDecoder",
);

beforeAll(() => {
  Object.defineProperty(globalThis, "TextDecoder", {
    configurable: true,
    value: TextDecoder,
  });
});

afterAll(() => {
  if (decoderDescriptor) {
    Object.defineProperty(globalThis, "TextDecoder", decoderDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "TextDecoder");
  }
});

test("parses multiple frames across every possible chunk boundary", () => {
  const input =
    ': keepalive\r\n\r\ndata: {"type":"token","text":"hi"}\r\n\r\n' +
    'data:{"type":"done"}\n\n';
  const expected = [{ type: "token", text: "hi" }, { type: "done" }];
  for (let split = 0; split <= input.length; split += 1) {
    const parser = new SseParser();
    expect([
      ...parser.feed(input.slice(0, split)),
      ...parser.feed(input.slice(split)),
      ...parser.flush(),
    ]).toEqual(expected);
  }
  const parser = new SseParser();
  expect([...input].flatMap((character) => parser.feed(character))).toEqual(
    expected,
  );
});

test("dispatches at blank lines and joins data fields with newlines", () => {
  const parser = new SseParser();
  expect(
    parser.feed(
      'event: ignored\nid: 4\nretry: 1000\ndata: {\n: keepalive\ndata: "text": "hi",\ndata: "type": "token"\ndata: }\n',
    ),
  ).toEqual([]);
  expect(parser.feed("\n")).toEqual([{ text: "hi", type: "token" }]);
  // A newline inside a JSON string is invalid; concatenating fields is wrong.
  expect(parser.feed('data: "hello\ndata: world"\n\n')).toEqual([]);
});

test("ignores non-data fields and bad JSON, then continues with valid JSON", () => {
  const parser = new SseParser();
  expect(
    parser.feed(
      ': keepalive\n\n{"type":"ignored"}\n\n data: 1\nData: 2\ndata\n\n' +
        'data: nope\n\ndata:\n\ndata: {"broken":\n\n' +
        'data: null\n\ndata: false\n\ndata: 42\n\ndata: "ok"\n\ndata: [1]\n\n',
    ),
  ).toEqual([null, false, 42, "ok", [1]]);
});

test.each(["", "\n", "\r\n"])(
  "flushes an event with final line ending %j only once",
  (ending) => {
    const parser = new SseParser();
    expect(parser.feed(`data: {"type":"done"}${ending}`)).toEqual([]);
    expect(parser.flush()).toEqual([{ type: "done" }]);
    expect(parser.flush()).toEqual([]);
    expect(parser.feed("data: 1\n\n")).toEqual([1]);
  },
);

test("flush discards malformed and comment-only final frames", () => {
  for (const input of ["", ": keepalive", "data: {", "data:", "event: done"]) {
    const parser = new SseParser();
    parser.feed(input);
    expect(parser.flush()).toEqual([]);
    expect(parser.feed("data: 1\n\n")).toEqual([1]);
  }
});

test("reads byte chunks with split UTF-8 characters and flushes at EOF", async () => {
  const bytes = new TextEncoder().encode(
    'data: {"type":"token","text":"Příliš 🙂"}\r\n\r\n' +
      'data: {"type":"done"}',
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const events: unknown[] = [];
  await readSseStream(stream, (event) => events.push(event));
  expect(events).toEqual([
    { type: "token", text: "Příliš 🙂" },
    { type: "done" },
  ]);
  expect(stream.locked).toBe(false);
});

test("flushes the decoder's incomplete final UTF-8 sequence", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: 1"));
      controller.enqueue(Uint8Array.of(0xc3));
      controller.close();
    },
  });
  const onEvent = jest.fn();
  await readSseStream(stream, onEvent);
  // The decoder's replacement character makes this frame invalid JSON.
  expect(onEvent).not.toHaveBeenCalled();
  expect(stream.locked).toBe(false);
});

test("cancels an already aborted stream without delivering buffered events", async () => {
  const controller = new AbortController();
  controller.abort();
  const cancel = jest.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(source) {
      source.enqueue(new TextEncoder().encode("data: 1\n\n"));
    },
    cancel,
  });
  const onEvent = jest.fn();
  await expect(
    readSseStream(stream, onEvent, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(onEvent).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(stream.locked).toBe(false);
});

test("aborting unblocks a pending read and discards a partial final event", async () => {
  const controller = new AbortController();
  const cancel = jest.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(source) {
      source.enqueue(new TextEncoder().encode("data: 1"));
    },
    cancel,
  });
  const onEvent = jest.fn();
  const reading = readSseStream(stream, onEvent, controller.signal);
  // Let the first chunk be consumed and the next read begin.
  await Promise.resolve();
  controller.abort();
  await expect(reading).rejects.toMatchObject({ name: "AbortError" });
  expect(onEvent).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(stream.locked).toBe(false);
});

test("stops dispatching if a callback aborts within a chunk", async () => {
  const controller = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    start(source) {
      source.enqueue(new TextEncoder().encode("data: 1\n\ndata: 2\n\n"));
    },
  });
  const onEvent = jest.fn(() => controller.abort());
  await expect(
    readSseStream(stream, onEvent, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(onEvent).toHaveBeenCalledTimes(1);
  expect(onEvent).toHaveBeenCalledWith(1);
  expect(stream.locked).toBe(false);
});

test("propagates reader errors and releases the lock without flushing", async () => {
  const error = new Error("Connection lost");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(error);
    },
  });
  const onEvent = jest.fn();
  await expect(readSseStream(stream, onEvent)).rejects.toBe(error);
  expect(onEvent).not.toHaveBeenCalled();
  expect(stream.locked).toBe(false);
});

test("propagates callback errors and cancels the stream", async () => {
  const cancel = jest.fn(() => Promise.reject(new Error("Cancel failed")));
  const error = new Error("Callback failed");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: 1\n\n"));
    },
    cancel,
  });
  await expect(
    readSseStream(stream, () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(stream.locked).toBe(false);
});
