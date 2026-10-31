import type { HostSession } from "@/core/transport/types";
import {
  utf8Decode,
  type SshError,
  type SshFileEntry,
} from "@/modules/termix-ssh";
import { showcaseFiles } from "@/showcase/backends";
import { SHOWCASE } from "@/showcase/enabled";
import { mapLimit } from "@/utils/limit";
import {
  copyName,
  joinRemote,
  LINK_LOOKUPS,
  remoteName,
  shellQuote,
} from "./paths";
import {
  deleteTrashItem,
  emptyTrash,
  listTrash,
  moveToTrash,
  restoreTrashItem,
  RETENTION_DAYS,
} from "./sftp-trash";
import type { FileBackend, FileEntry, FileType } from "./types";

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

/** The trash can't take this item (another file system); deleting for good still works. */
export class TrashUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrashUnavailableError";
  }
}

export function typeOf(entry: SshFileEntry): FileType {
  if (entry.isSymlink) return "link";
  const kind = entry.permissions & S_IFMT;
  if (kind === S_IFLNK) return "link";
  if (entry.isDir || kind === S_IFDIR) return "directory";
  return "file";
}

export function toEntry(dir: string, entry: SshFileEntry): FileEntry {
  return {
    name: entry.name,
    path: joinRemote(dir, entry.name),
    type: typeOf(entry),
    size: entry.size,
    mtime: entry.mtime || null,
    atime: entry.atime || null,
    mode: entry.permissions & 0o7777,
    uid: entry.uid,
    gid: entry.gid,
    linkTarget: entry.linkTarget,
  };
}

/** Parses `getent passwd` or `/etc/passwd` style lines into id to name. */
export function parseIdNames(text: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const line of text.split("\n")) {
    const parts = line.split(":");
    if (parts.length < 3) continue;
    const id = Number(parts[2]);
    if (parts[0] && Number.isInteger(id)) out.set(id, parts[0]);
  }
  return out;
}

/** A file that has a NUL byte near the start is treated as binary. */
export function looksBinary(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, 8000);
  for (let i = 0; i < end; i++) if (bytes[i] === 0) return true;
  return false;
}

const reopenable = (error: unknown) => {
  const kind = (error as SshError | undefined)?.kind;
  return kind === "disconnected" || kind === "channel";
};

/**
 * Files over the phone's own SSH connection. `open` logs in again after the
 * connection dropped; each call retries once on a fresh session.
 */
export function createSftpBackend(
  open: () => Promise<HostSession>,
): FileBackend {
  if (SHOWCASE) return showcaseFiles();
  let current: Promise<HostSession> | null = null;
  const users = new Map<number, string>();
  const groups = new Map<number, string>();

  const session = () => {
    if (!current) {
      current = open();
      current.catch(() => {
        current = null;
      });
    }
    return current;
  };

  async function run<T>(fn: (s: HostSession) => Promise<T>): Promise<T> {
    const s = await session();
    try {
      return await fn(s);
    } catch (error) {
      if (!reopenable(error)) throw error;
      void s.close();
      current = null;
      return fn(await session());
    }
  }

  async function exec(command: string, timeoutSecs = 30) {
    return run(async (s) => {
      const result = await s.exec(command, { timeoutSecs });
      return {
        stdout: utf8Decode(result.stdout),
        stderr: utf8Decode(result.stderr),
        exitCode: result.exitCode,
      };
    });
  }

  async function execOk(command: string, timeoutSecs?: number) {
    const result = await exec(command, timeoutSecs);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Command failed: ${command}`);
    }
    return result.stdout;
  }

  async function exists(path: string) {
    try {
      await run((s) => s.sftp.lstat(path));
      return true;
    } catch {
      return false;
    }
  }

  // Owner names come from one lookup per new id, never per row.
  async function fillNames(entries: FileEntry[]) {
    const wantUsers = new Set<number>();
    const wantGroups = new Set<number>();
    for (const e of entries) {
      if (e.uid != null && !users.has(e.uid)) wantUsers.add(e.uid);
      if (e.gid != null && !groups.has(e.gid)) wantGroups.add(e.gid);
    }
    const lookup = async (db: string, ids: Set<number>, into: typeof users) => {
      if (!ids.size) return;
      const list = [...ids].join(" ");
      const file = db === "passwd" ? "/etc/passwd" : "/etc/group";
      const out = await exec(
        `getent ${db} ${list} 2>/dev/null || cat ${file}`,
        10,
      ).catch(() => null);
      const names = parseIdNames(out?.stdout ?? "");
      for (const id of ids) into.set(id, names.get(id) ?? String(id));
    };
    await Promise.all([
      lookup("passwd", wantUsers, users),
      lookup("group", wantGroups, groups),
    ]);
    for (const e of entries) {
      if (e.uid != null) e.owner = users.get(e.uid) ?? null;
      if (e.gid != null) e.group = groups.get(e.gid) ?? null;
    }
  }

  async function freeTarget(toDir: string, name: string) {
    const target = joinRemote(toDir, name);
    return (await exists(target)) ? joinRemote(toDir, copyName(name)) : target;
  }

  const backend: FileBackend = {
    kind: "sftp",

    home: () => run((s) => s.sftp.realpath(".")),

    async list(path) {
      const resolved = await run((s) => s.sftp.realpath(path));
      const raw = await run((s) => s.sftp.list(resolved));
      const files = raw
        .filter((e) => e.name !== "." && e.name !== "..")
        .map((e) => toEntry(resolved, e));
      // A link's target decides whether it opens as a folder.
      await mapLimit(
        files.filter((f) => f.type === "link"),
        LINK_LOOKUPS,
        async (f) => {
          try {
            const target = await run((s) => s.sftp.stat(f.path));
            f.targetType = target.isDir ? "directory" : "file";
          } catch {
            f.targetType = null;
          }
        },
      );
      await fillNames(files);
      return { path: resolved, files };
    },

    async stat(path) {
      const raw = await run((s) => s.sftp.lstat(path));
      const entry = toEntry(path.slice(0, path.lastIndexOf("/")) || "/", {
        ...raw,
        name: remoteName(path),
      });
      entry.path = path;
      if (entry.type === "link") {
        entry.linkTarget = await run((s) => s.sftp.readLink(path)).catch(
          () => entry.linkTarget ?? null,
        );
        try {
          const target = await run((s) => s.sftp.stat(path));
          entry.targetType = target.isDir ? "directory" : "file";
        } catch {
          entry.targetType = null;
        }
      }
      await fillNames([entry]);
      return entry;
    },

    mkdir: (dir, name) => run((s) => s.sftp.mkdir(joinRemote(dir, name))),

    async createFile(dir, name) {
      const path = joinRemote(dir, name);
      if (await exists(path)) throw new Error(`${name} already exists`);
      await run((s) => s.sftp.writeFile(path, new Uint8Array(0)));
    },

    async rename(path, newName) {
      const parent = path.slice(0, path.lastIndexOf("/")) || "/";
      await run((s) => s.sftp.rename(path, joinRemote(parent, newName)));
    },

    async move(path, toDir) {
      const target = joinRemote(toDir, remoteName(path));
      if (target === path) return;
      if (await exists(target)) {
        throw new Error(`${remoteName(path)} already exists there`);
      }
      try {
        await run((s) => s.sftp.rename(path, target));
      } catch {
        // SFTP rename can't cross file systems; mv can.
        await execOk(`mv ${shellQuote(path)} ${shellQuote(target)}`, 300);
      }
    },

    async copy(path, toDir) {
      const target = await freeTarget(toDir, remoteName(path));
      await execOk(`cp -a ${shellQuote(path)} ${shellQuote(target)}`, 600);
    },

    async remove(entries, permanent) {
      for (const entry of entries) {
        if (permanent) {
          await run(async (s) => {
            if (entry.type === "directory") {
              await s.sftp.removeRecursive(entry.path);
            } else {
              await s.sftp.remove(entry.path);
            }
          });
          continue;
        }
        try {
          await run((s) => moveToTrash(s.sftp, entry.path));
        } catch (error) {
          throw new TrashUnavailableError(
            `${entry.name} can't go to the trash: ${(error as Error).message}`,
          );
        }
      }
    },

    chmod: (path, mode) => run((s) => s.sftp.chmod(path, mode & 0o7777)),

    symlink: (path, target) => run((s) => s.sftp.symlink(path, target)),

    async folderSize(path) {
      const out = await exec(`du -sk ${shellQuote(path)}`, 120).catch(
        () => null,
      );
      const kb = Number(out?.stdout.trim().split(/\s+/)[0]);
      return Number.isFinite(kb) && out?.stdout.trim() ? kb * 1024 : null;
    },

    async readText(path, maxBytes) {
      const size = (await run((s) => s.sftp.stat(path))).size;
      const bytes = await run((s) => s.sftp.readFile(path, maxBytes));
      return { text: looksBinary(bytes) ? null : utf8Decode(bytes), size };
    },

    writeText: (path, text) => run((s) => s.sftp.writeFile(path, text)),

    async download(remote, localPath, options = {}) {
      await run((s) => s.sftp.download(remote, localPath, options));
    },

    async upload(localPath, remoteDir, name, options = {}) {
      await run((s) =>
        s.sftp.upload(localPath, joinRemote(remoteDir, name), options),
      );
    },

    async uploadedBytes(remoteDir, name) {
      try {
        return (await run((s) => s.sftp.stat(joinRemote(remoteDir, name))))
          .size;
      } catch {
        return 0;
      }
    },

    trash: {
      async list() {
        const items = await run((s) => listTrash(s.sftp));
        return { items, retentionDays: RETENTION_DAYS };
      },
      restore: (id) => run((s) => restoreTrashItem(s.sftp, id)),
      remove: (id) => run((s) => deleteTrashItem(s.sftp, id)),
      empty: () => run((s) => emptyTrash(s.sftp)),
    },

    close() {
      const s = current;
      current = null;
      void s?.then((session) => session.close()).catch(() => {});
    },
  };
  return backend;
}
