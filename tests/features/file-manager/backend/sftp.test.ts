import {
  createSftpBackend,
  looksBinary,
  parseIdNames,
  TrashUnavailableError,
  typeOf,
} from "@/features/file-manager/backend/sftp";
import type { HostSession } from "@/core/transport/types";
import { SshError } from "@/modules/termix-ssh";
import { fakeSftp } from "./fakeSftp";

const enc = (s: string) => new TextEncoder().encode(s);

function setup() {
  const fs = fakeSftp();
  const exec = jest.fn(async (command: string) => {
    if (command.startsWith("getent passwd")) {
      return {
        stdout: enc("u:x:1000:1000::/home/u:/bin/sh\n"),
        stderr: enc(""),
        exitCode: 0,
      };
    }
    if (command.startsWith("getent group")) {
      return { stdout: enc("staff:x:1000:\n"), stderr: enc(""), exitCode: 0 };
    }
    if (command.startsWith("du -sk")) {
      return { stdout: enc("12\t/x\n"), stderr: enc(""), exitCode: 0 };
    }
    return { stdout: enc(""), stderr: enc(""), exitCode: 0 };
  });
  const session = {
    exec,
    sftp: fs.sftp,
    close: jest.fn(async () => {}),
  } as unknown as HostSession;
  const open = jest.fn(async () => session);
  return { fs, exec, session, open, backend: createSftpBackend(open) };
}

test("lists a folder with types, owner names and link targets", async () => {
  const { fs, backend } = setup();
  fs.put("/home/u/a.txt", "hi");
  fs.dirs.add("/home/u/src");
  fs.links.set("/home/u/to-src", "/home/u/src");
  const { path, files } = await backend.list(".");
  expect(path).toBe("/home/u");
  const byName = Object.fromEntries(files.map((f) => [f.name, f]));
  expect(byName["a.txt"]).toMatchObject({
    type: "file",
    size: 2,
    mode: 0o644,
    owner: "u",
    group: "staff",
  });
  expect(byName.src.type).toBe("directory");
  expect(byName["to-src"]).toMatchObject({
    type: "link",
    linkTarget: "/home/u/src",
    targetType: "directory",
  });
});

test("owner names are looked up once per id", async () => {
  const { fs, exec, backend } = setup();
  fs.put("/home/u/a", "1");
  await backend.list("/home/u");
  await backend.list("/home/u");
  expect(
    exec.mock.calls.filter(([c]) => c.startsWith("getent passwd")),
  ).toHaveLength(1);
});

test("copy picks a free name and runs cp on the host", async () => {
  const { fs, exec, backend } = setup();
  fs.put("/home/u/a.txt", "1");
  await backend.copy("/home/u/a.txt", "/home/u");
  const cp = exec.mock.calls.map(([c]) => c).find((c) => c.startsWith("cp -a"));
  expect(cp).toMatch(
    /^cp -a '\/home\/u\/a\.txt' '\/home\/u\/a_copy_\d+\.txt'$/,
  );
});

test("move renames, and falls back to mv across file systems", async () => {
  const { fs, exec, backend } = setup();
  fs.put("/home/u/a.txt", "1");
  fs.dirs.add("/tmp");
  await backend.move("/home/u/a.txt", "/tmp");
  expect(fs.files.has("/tmp/a.txt")).toBe(true);

  fs.put("/home/u/b.txt", "2");
  fs.sftp.rename.mockRejectedValueOnce(new Error("cross device"));
  await backend.move("/home/u/b.txt", "/tmp");
  expect(exec).toHaveBeenCalledWith("mv '/home/u/b.txt' '/tmp/b.txt'", {
    timeoutSecs: 300,
  });
  fs.put("/tmp/c", "x");
  fs.put("/home/u/c", "y");
  await expect(backend.move("/home/u/c", "/tmp")).rejects.toThrow(
    /already exists/,
  );
});

test("delete goes to the trash, which lists and restores", async () => {
  const { fs, backend } = setup();
  fs.put("/home/u/a.txt", "1");
  await backend.remove(
    [
      {
        name: "a.txt",
        path: "/home/u/a.txt",
        type: "file",
        size: 1,
        mtime: null,
        mode: null,
      },
    ],
    false,
  );
  expect(fs.files.has("/home/u/a.txt")).toBe(false);
  const { items, retentionDays } = await backend.trash!.list();
  expect(retentionDays).toBe(7);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    name: "a.txt",
    originalPath: "/home/u/a.txt",
  });
  await backend.trash!.restore(items[0].id);
  expect(fs.files.has("/home/u/a.txt")).toBe(true);
  expect((await backend.trash!.list()).items).toEqual([]);
});

test("a trash that can't take the item says so; permanent delete removes it", async () => {
  const { fs, backend } = setup();
  fs.put("/mnt/x/a", "1");
  fs.sftp.rename.mockRejectedValueOnce(new Error("cross device"));
  const item = {
    name: "a",
    path: "/mnt/x/a",
    type: "file" as const,
    size: 1,
    mtime: null,
    mode: null,
  };
  await expect(backend.remove([item], false)).rejects.toBeInstanceOf(
    TrashUnavailableError,
  );
  await backend.remove([item], true);
  expect(fs.files.has("/mnt/x/a")).toBe(false);
});

test("text reads spot binary files", async () => {
  const { fs, backend } = setup();
  fs.put("/home/u/t.txt", "héllo");
  fs.files.set("/home/u/b.bin", new Uint8Array([1, 0, 2]));
  expect(await backend.readText("/home/u/t.txt", 100)).toEqual({
    text: "héllo",
    size: 6,
  });
  expect((await backend.readText("/home/u/b.bin", 100)).text).toBeNull();
  await backend.writeText("/home/u/t.txt", "new");
  expect(new TextDecoder().decode(fs.files.get("/home/u/t.txt"))).toBe("new");
});

test("transfers go to the engine with the offset; resumed uploads read the remote size", async () => {
  const { fs, backend } = setup();
  const signal = new AbortController().signal;
  await backend.download("/home/u/a", "/local/a", { offset: 5, signal });
  expect(fs.sftp.download).toHaveBeenCalledWith("/home/u/a", "/local/a", {
    offset: 5,
    signal,
  });
  await backend.upload("/local/b", "/home/u", "b", { offset: 0 });
  expect(fs.sftp.upload).toHaveBeenCalledWith("/local/b", "/home/u/b", {
    offset: 0,
  });
  fs.put("/home/u/b", "abc");
  expect(await backend.uploadedBytes("/home/u", "b")).toBe(3);
  expect(await backend.uploadedBytes("/home/u", "none")).toBe(0);
});

test("a dropped connection opens a new session once", async () => {
  const { fs, open, backend } = setup();
  fs.sftp.realpath.mockRejectedValueOnce(new SshError("disconnected", "gone"));
  await expect(backend.home()).resolves.toBe("/home/u");
  expect(open).toHaveBeenCalledTimes(2);
});

test("chmod, symlink and folder size", async () => {
  const { fs, backend } = setup();
  fs.put("/home/u/a", "1");
  await backend.chmod("/home/u/a", 0o100755);
  expect(fs.sftp.chmod).toHaveBeenCalledWith("/home/u/a", 0o755);
  await backend.symlink!("/home/u/l", "/home/u/a");
  expect(fs.links.get("/home/u/l")).toBe("/home/u/a");
  expect(await backend.folderSize("/home/u")).toBe(12 * 1024);
});

test("helpers", () => {
  expect(parseIdNames("root:x:0:0\nbad\nu:x:1000:1000").get(1000)).toBe("u");
  expect(looksBinary(new Uint8Array([65, 0]))).toBe(true);
  expect(looksBinary(new Uint8Array([65, 66]))).toBe(false);
  expect(
    typeOf({ isSymlink: false, isDir: false, permissions: 0o120777 } as never),
  ).toBe("link");
});
