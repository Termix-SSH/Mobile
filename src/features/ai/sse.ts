/** Incremental JSON events from SSE data fields; unknown frames stay unknown. */
export class SseParser {
  private buffer = "";
  private data: string[] = [];

  feed(chunk: string): unknown[] {
    this.buffer += chunk;
    const events: unknown[] = [];
    let start = 0;
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      this.line(this.buffer.slice(start, newline), events);
      start = newline + 1;
      newline = this.buffer.indexOf("\n", start);
    }
    this.buffer = this.buffer.slice(start);
    return events;
  }

  /** Accept the final line/event even when the server omitted its separator. */
  flush(): unknown[] {
    const events: unknown[] = [];
    if (this.buffer) this.line(this.buffer, events);
    this.buffer = "";
    this.dispatch(events);
    return events;
  }

  private line(raw: string, events: unknown[]): void {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line === "") {
      this.dispatch(events);
    } else if (line.startsWith("data:")) {
      const value = line.slice(5);
      // SSE removes exactly one optional space after the colon.
      this.data.push(value.startsWith(" ") ? value.slice(1) : value);
    }
  }

  private dispatch(events: unknown[]): void {
    if (this.data.length === 0) return;
    const data = this.data.join("\n");
    this.data = [];
    try {
      events.push(JSON.parse(data));
    } catch {
      // A malformed frame must not prevent later events from being read.
    }
  }
}

/** Read UTF-8 incrementally, releasing the stream on completion or failure. */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const parser = new SseParser();
  let completed = false;
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    // Cancellation unblocks a pending read; cleanup must not mask its error.
    void reader.cancel().catch(() => {});
  };
  const checkAbort = () => {
    if (!signal?.aborted) return;
    const error = new Error("The stream was aborted");
    error.name = "AbortError";
    throw error;
  };
  const emit = (events: unknown[]) => {
    for (const event of events) {
      checkAbort();
      onEvent(event);
    }
    checkAbort();
  };

  try {
    const decoder = new TextDecoder();
    signal?.addEventListener("abort", cancel);
    if (signal?.aborted) cancel();
    checkAbort();
    while (true) {
      const { done, value } = await reader.read();
      checkAbort();
      if (done) {
        emit(parser.feed(decoder.decode()));
        emit(parser.flush());
        completed = true;
        return;
      }
      emit(parser.feed(decoder.decode(value, { stream: true })));
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (!completed) cancel();
    reader.releaseLock();
  }
}
