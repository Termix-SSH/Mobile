/** A WebSocket stand in: records what was sent and lets a test play the server. */
export class FakeSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  sent: any[] = [];
  closed = false;
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (e: { data: string }) => void;
  constructor(
    public url: string,
    public protocols?: string[],
  ) {}
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  message(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
  }
}

/** Sets global WebSocket to the fake for the tests of one file. */
export function useFakeWebSocket() {
  const real = global.WebSocket;
  beforeEach(() => {
    (global as any).WebSocket = FakeSocket;
  });
  afterEach(() => {
    (global as any).WebSocket = real;
  });
}

/** Lets pending promise callbacks run. */
export const flush = () => new Promise((r) => setTimeout(r, 0));
