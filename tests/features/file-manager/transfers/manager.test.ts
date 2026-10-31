import { TransferManager } from "@/features/file-manager/transfers/manager";
import type { FileBackend } from "@/features/file-manager/backend/types";

const mockSizes = new Map<string, number>();
const mockRemoved: string[] = [];

jest.mock("@/features/file-manager/backend/local-io", () => ({
  localSize: (p: string) => mockSizes.get(p) ?? 0,
  removeLocal: (p: string) => mockRemoved.push(p),
}));

type Call = {
  offset?: number;
  signal?: AbortSignal;
  onProgress?: (d: number, t: number) => void;
  resolve: () => void;
  reject: (e: Error) => void;
};

function fakeBackend() {
  const calls: Call[] = [];
  const pending = (options: any = {}) =>
    new Promise<void>((resolve, reject) => {
      const call = { ...options, resolve, reject };
      calls.push(call);
      options.signal?.addEventListener("abort", () =>
        reject(new Error("aborted")),
      );
    });
  const backend = {
    download: jest.fn((_r: string, _l: string, o: any) => pending(o)),
    upload: jest.fn((_l: string, _d: string, _n: string, o: any) => pending(o)),
    uploadedBytes: jest.fn(async () => 7),
    remove: jest.fn(async () => {}),
  } as unknown as FileBackend;
  return { backend, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const input = (name: string, kind: "download" | "upload" = "download") => ({
  kind,
  name,
  remotePath: kind === "download" ? `/r/${name}` : "/r",
  localPath: `/l/${name}`,
  total: 100,
});

beforeEach(() => {
  mockSizes.clear();
  mockRemoved.length = 0;
});

test("runs a few at a time and starts the next when one finishes", async () => {
  const { backend, calls } = fakeBackend();
  const onDownloaded = jest.fn();
  const m = new TransferManager(backend, {
    concurrency: () => 2,
    onDownloaded,
  });
  m.add([input("a"), input("b"), input("c")]);
  await flush();
  expect(calls).toHaveLength(2);
  calls[0].resolve();
  await flush();
  await flush();
  expect(calls).toHaveLength(3);
  expect(m.getSnapshot().map((t) => t.state)).toEqual([
    "done",
    "running",
    "running",
  ]);
  expect(onDownloaded).toHaveBeenCalledTimes(1);
});

test("pause keeps what arrived and resume starts from it", async () => {
  const { backend, calls } = fakeBackend();
  const m = new TransferManager(backend, { concurrency: () => 1 });
  const [id] = m.add([input("a")]);
  await flush();
  expect(calls[0].offset).toBe(0);
  m.pause(id);
  await flush();
  expect(m.getSnapshot()[0].state).toBe("paused");
  expect(mockRemoved).toEqual([]);
  mockSizes.set("/l/a", 40);
  m.resume(id);
  await flush();
  await flush();
  expect(calls[1].offset).toBe(40);
});

test("a resumed upload asks the host how much it has", async () => {
  const { backend, calls } = fakeBackend();
  const m = new TransferManager(backend, { concurrency: () => 1 });
  const [id] = m.add([input("u", "upload")]);
  await flush();
  calls[0].reject(new Error("network"));
  await flush();
  expect(m.getSnapshot()[0]).toMatchObject({
    state: "failed",
    error: "network",
  });
  m.retry(id);
  await flush();
  await flush();
  expect(backend.uploadedBytes).toHaveBeenCalledWith("/r", "u");
  expect(calls[1].offset).toBe(7);
});

test("cancel drops the partial file", async () => {
  const { backend } = fakeBackend();
  const m = new TransferManager(backend, { concurrency: () => 1 });
  const [down, up] = m.add([input("a"), input("u", "upload")]);
  await flush();
  m.cancel(down);
  await flush();
  await flush();
  expect(mockRemoved).toEqual(["/l/a"]);
  // The upload starts after the cancel, then gets cancelled too.
  m.cancel(up);
  await flush();
  await flush();
  expect(backend.remove).toHaveBeenCalledWith(
    [expect.objectContaining({ path: "/r/u" })],
    true,
  );
  expect(m.getSnapshot().map((t) => t.state)).toEqual([
    "cancelled",
    "cancelled",
  ]);
});

test("progress reaches listeners, a few times a second at most", async () => {
  const { backend, calls } = fakeBackend();
  const m = new TransferManager(backend, { concurrency: () => 1 });
  const listener = jest.fn();
  m.subscribe(listener);
  m.add([input("a")]);
  await flush();
  const before = listener.mock.calls.length;
  for (let i = 0; i < 50; i++) calls[0].onProgress?.(i, 100);
  expect(listener.mock.calls.length - before).toBeLessThanOrEqual(1);
  expect(m.getSnapshot()[0].done).toBe(49);
});
