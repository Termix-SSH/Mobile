import {
  createRelayBackend,
  fromRelayEntry,
  parseModeString,
  UPLOAD_CHUNK,
} from "@/features/file-manager/backend/relay";
import { TrashUnavailableError } from "@/features/file-manager/backend/sftp";
import { ApiError } from "@/core/api/errors";

const mockWritten: Uint8Array[] = [];
let mockAppend: boolean | null = null;
let mockLocalBytes = new Uint8Array(0);

jest.mock("@/features/file-manager/backend/local-io", () => ({
  openWriter: (_path: string, append: boolean) => {
    mockAppend = append;
    return { write: (b: Uint8Array) => mockWritten.push(b), close: jest.fn() };
  },
  openReader: (_path: string, offset: number) => {
    let at = offset;
    return {
      size: mockLocalBytes.length,
      read: (n: number) => {
        const out = mockLocalBytes.slice(at, at + n);
        at += n;
        return out;
      },
      close: jest.fn(),
    };
  },
}));

function streamOf(chunks: number[][]) {
  let i = 0;
  return {
    getReader: () => ({
      read: async () =>
        i < chunks.length
          ? { done: false, value: new Uint8Array(chunks[i++]) }
          : { done: true, value: undefined },
      cancel: jest.fn(async () => {}),
    }),
  };
}

function setup(nativeNetwork = false) {
  const files = {
    listSSHFiles: jest.fn(async (_sid: string, path: string) => ({
      path: path === "." ? "/home/u" : path,
      files: [
        {
          name: "a.txt",
          type: "file",
          size: 3,
          modifiedTimestamp: 1700000000,
          permissions: "-rw-r--r--",
          owner: "u",
          group: "u",
        },
        { name: "l", type: "link", linkTarget: "/etc" },
      ],
    })),
    identifySSHSymlink: jest.fn(async () => ({
      path: "/home/u/l",
      target: "/etc",
      type: "directory",
    })),
    deleteSSHItem: jest.fn(async () => ({})),
    moveSSHItem: jest.fn(async () => ({})),
    changeSSHPermissions: jest.fn(async () => ({})),
    readSSHFile: jest.fn(async () => ({ content: "hello", path: "/a" })),
    downloadStream: jest.fn(),
    uploadChunk: jest.fn(),
    disconnectSSH: jest.fn(async () => {}),
  };
  const client = {
    api: { files },
    usesNativeNetwork: () => nativeNetwork,
  } as any;
  return { files, backend: createRelayBackend(client, () => "sid", 7) };
}

beforeEach(() => {
  mockWritten.length = 0;
  mockAppend = null;
});

test("entries map the plugin's list rows", () => {
  expect(parseModeString("drwxr-x---")).toBe(0o750);
  expect(parseModeString("rwsr-xr-t")).toBe(0o5755);
  expect(parseModeString("644")).toBe(0o644);
  expect(parseModeString("bad")).toBeNull();
  expect(
    fromRelayEntry("/d", { name: "x", type: "directory", size: "4" }),
  ).toMatchObject({ path: "/d/x", type: "directory", size: 4, mtime: null });
});

test("list fills link targets from the server", async () => {
  const { backend } = setup();
  const { path, files } = await backend.list(".");
  expect(path).toBe("/home/u");
  expect(files[0]).toMatchObject({
    name: "a.txt",
    mode: 0o644,
    mtime: 1700000000,
    owner: "u",
  });
  expect(files[1]).toMatchObject({ type: "link", targetType: "directory" });
});

test("move sends the full target path, chmod sends octal", async () => {
  const { files, backend } = setup();
  await backend.move("/home/u/a.txt", "/tmp");
  expect(files.moveSSHItem).toHaveBeenCalledWith(
    "sid",
    "/home/u/a.txt",
    "/tmp/a.txt",
    7,
  );
  await backend.chmod("/home/u/a.txt", 0o100750);
  expect(files.changeSSHPermissions).toHaveBeenCalledWith(
    "sid",
    "/home/u/a.txt",
    "750",
    7,
  );
});

test("a full trash or other file system turns into TrashUnavailableError", async () => {
  const { files, backend } = setup();
  files.deleteSSHItem.mockRejectedValueOnce(
    new ApiError("Conflict", 409, "CONFLICT"),
  );
  const item = {
    name: "a",
    path: "/a",
    type: "file" as const,
    size: 0,
    mtime: null,
    mode: null,
  };
  await expect(backend.remove([item], false)).rejects.toBeInstanceOf(
    TrashUnavailableError,
  );
  await backend.remove([item], true);
  expect(files.deleteSSHItem).toHaveBeenLastCalledWith(
    "sid",
    "/a",
    false,
    7,
    undefined,
    true,
  );
});

test("a resumed download appends when the server answers 206", async () => {
  const { files, backend } = setup();
  files.downloadStream.mockResolvedValue({
    status: 206,
    headers: { get: () => "4" },
    body: streamOf([
      [1, 2],
      [3, 4],
    ]),
  });
  const progress: [number, number][] = [];
  await backend.download("/r/a", "/l/a", {
    offset: 10,
    onProgress: (d, t) => progress.push([d, t]),
  });
  expect(files.downloadStream).toHaveBeenCalledWith(
    "sid",
    "/r/a",
    10,
    undefined,
  );
  expect(mockAppend).toBe(true);
  expect(progress).toEqual([
    [12, 14],
    [14, 14],
  ]);
});

test("an older server ignores Range: the download starts over", async () => {
  const { files, backend } = setup();
  files.downloadStream.mockResolvedValue({
    status: 200,
    headers: { get: () => "2" },
    body: streamOf([[1, 2]]),
  });
  const progress: number[] = [];
  await backend.download("/r/a", "/l/a", {
    offset: 10,
    onProgress: (d) => progress.push(d),
  });
  expect(mockAppend).toBe(false);
  expect(progress).toEqual([2]);
});

test("uploads go in chunks from the offset, with no base64", async () => {
  const { files, backend } = setup();
  mockLocalBytes = new Uint8Array(UPLOAD_CHUNK + 10);
  files.uploadChunk.mockImplementation(
    async (
      _s: string,
      _d: string,
      _n: string,
      offset: number,
      total: number,
      bytes: Uint8Array,
    ) => ({
      nextOffset: offset + bytes.length,
      complete: offset + bytes.length >= total,
    }),
  );
  await backend.upload("/l/f", "/r", "f", { offset: 0 });
  const calls = files.uploadChunk.mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][3]).toBe(0);
  expect(calls[0][5]).toBeInstanceOf(Uint8Array);
  expect(calls[1][3]).toBe(UPLOAD_CHUNK);
  expect(calls[1][5].length).toBe(10);

  files.uploadChunk.mockClear();
  await backend.upload("/l/f", "/r", "f", { offset: UPLOAD_CHUNK });
  expect(files.uploadChunk).toHaveBeenCalledTimes(1);
  expect(files.uploadChunk.mock.calls[0][3]).toBe(UPLOAD_CHUNK);
});

test("an empty file still makes the remote file", async () => {
  const { files, backend } = setup();
  mockLocalBytes = new Uint8Array(0);
  files.uploadChunk.mockResolvedValue({ nextOffset: 0, complete: true });
  await backend.upload("/l/e", "/r", "e");
  expect(files.uploadChunk).toHaveBeenCalledWith(
    "sid",
    "/r",
    "e",
    0,
    0,
    expect.any(Uint8Array),
    undefined,
  );
});

test("binary reads come back as null text", async () => {
  const { files, backend } = setup();
  files.readSSHFile.mockResolvedValueOnce({
    content: "AAE=",
    path: "/home/u/a.txt",
    encoding: "base64",
  } as any);
  expect((await backend.readText("/home/u/a.txt", 100)).text).toBeNull();
  expect(await backend.readText("/home/u/a.txt", 100)).toEqual({
    text: "hello",
    size: 3,
  });
});
