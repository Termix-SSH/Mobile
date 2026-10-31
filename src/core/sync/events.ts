import { utf8Decode } from "@/core/db/bytes";
import { nativeStream } from "@/modules/termix-net";

export interface ServerEvent {
  event: string;
  data: string;
}

/** Splits a text/event-stream into events. Comments (": ping") are dropped. */
export class EventStreamParser {
  private buffer = "";

  push(chunk: string): ServerEvent[] {
    this.buffer += chunk.replace(/\r\n?/g, "\n");
    const out: ServerEvent[] = [];
    let end = this.buffer.indexOf("\n\n");
    while (end >= 0) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (block.split("\n").some((l) => l && !l.startsWith(":"))) {
        out.push({ event, data: data.join("\n") });
      }
      end = this.buffer.indexOf("\n\n");
    }
    return out;
  }
}

export interface EventStreamOptions {
  url: string;
  headers: Record<string, string>;
  /** iOS with a client certificate: read through the native module. */
  native: boolean;
  onEvent(event: ServerEvent): void;
  /** The stream opened with this status. */
  onOpen?(status: number): void;
  /** Ended or failed. Not called after close(). */
  onClose(reason: { status?: number; error?: string }): void;
  fetchImpl?: typeof fetch;
}

/** Opens one event stream. Returns a function that closes it. */
export function openEventStream(options: EventStreamOptions): () => void {
  const parser = new EventStreamParser();
  let closed = false;
  const finish = (reason: { status?: number; error?: string }) => {
    if (closed) return;
    closed = true;
    options.onClose(reason);
  };
  const deliver = (chunk: string) => {
    if (closed) return;
    for (const event of parser.push(chunk)) options.onEvent(event);
  };

  if (options.native) {
    let status: number | undefined;
    const stop = nativeStream(
      { url: options.url, headers: options.headers },
      {
        onResponse(code) {
          status = code;
          if (code >= 200 && code < 300) options.onOpen?.(code);
          else finish({ status: code });
        },
        onData: deliver,
        onEnd: (error) => finish({ status, error }),
      },
    );
    return () => {
      closed = true;
      stop();
    };
  }

  const controller = new AbortController();
  void (async () => {
    try {
      // Global fetch is expo/fetch since SDK 56, which streams bodies.
      const fetchImpl = options.fetchImpl ?? fetch;
      const response = await fetchImpl(options.url, {
        headers: options.headers,
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        finish({ status: response.status });
        return;
      }
      options.onOpen?.(response.status);
      const reader = response.body.getReader();
      const decode = decoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        deliver(decode(value));
      }
      finish({ status: response.status });
    } catch (error) {
      if (closed) return;
      finish({ error: error instanceof Error ? error.message : String(error) });
    }
  })();
  return () => {
    closed = true;
    controller.abort();
  };
}

function decoder(): (bytes: Uint8Array) => string {
  if (typeof TextDecoder !== "undefined") {
    const text = new TextDecoder();
    return (bytes) => text.decode(bytes, { stream: true });
  }
  // The stream is plain ASCII event names and "{}", so a split character
  // can't land between chunks.
  return utf8Decode;
}
