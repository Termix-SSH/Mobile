import type { AccountClient } from "@/core/api/AccountClient";
import { AppError } from "@/core/errors";
import { openReader, openWriter } from "./local-io";
import { mapLimit } from "@/utils/limit";
import { joinRemote, LINK_LOOKUPS, remoteName, remoteParent } from "./paths";
import { TrashUnavailableError } from "./sftp";
import type { FileBackend, FileEntry, FileType } from "./types";

/** Slices sent per request; the server takes up to 64 MB. */
export const UPLOAD_CHUNK = 4 * 1024 * 1024;

/** `rwxr-xr-x` (with or without the type letter) as permission bits. */
export function parseModeString(text: unknown): number | null {
  if (typeof text !== "string") return null;
  // A folder has only a few distinct modes, so each is parsed once.
  const cached = MODES.get(text);
  if (cached !== undefined) return cached;
  const mode = readMode(text);
  if (MODES.size > 256) MODES.clear();
  MODES.set(text, mode);
  return mode;
}

const MODES = new Map<string, number | null>();

function readMode(text: string): number | null {
  if (/^[0-7]{3,4}$/.test(text)) return parseInt(text, 8);
  const perms = text.length === 10 ? text.slice(1) : text;
  if (!/^[rwxsStT-]{9}$/.test(perms)) return null;
  let mode = 0;
  const bit = (i: number, value: number) => {
    const c = perms[i];
    if (c !== "-" && c !== "S" && c !== "T") mode |= value;
  };
  [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001].forEach(
    (value, i) => bit(i, value),
  );
  if (/[sS]/.test(perms[2])) mode |= 0o4000;
  if (/[sS]/.test(perms[5])) mode |= 0o2000;
  if (/[tT]/.test(perms[8])) mode |= 0o1000;
  return mode;
}

export function fromRelayEntry(dir: string, raw: any): FileEntry {
  const type: FileType =
    raw?.type === "directory" || raw?.type === "link" ? raw.type : "file";
  const name = String(raw?.name ?? "");
  const mtime = Number(raw?.modifiedTimestamp);
  return {
    name,
    path: typeof raw?.path === "string" ? raw.path : joinRemote(dir, name),
    type,
    size: Number(raw?.size) || 0,
    mtime: Number.isFinite(mtime) && mtime > 0 ? Math.floor(mtime) : null,
    mode: parseModeString(raw?.permissions),
    owner: raw?.owner ?? null,
    group: raw?.group ?? null,
    linkTarget: raw?.linkTarget ?? null,
    targetType: null,
  };
}

function isTrashConflict(error: unknown) {
  return error instanceof AppError && error.status === 409;
}

/** Files through the server's File Manager plugin, with its session id. */
export function createRelayBackend(
  client: AccountClient,
  sessionId: () => string,
  hostId: number,
): FileBackend {
  const files = client.api.files;

  async function list(path: string) {
    const res = await files.listSSHFiles(sessionId(), path);
    const resolved = res.path || path;
    return {
      path: resolved,
      files: (res.files ?? []).map((f) => fromRelayEntry(resolved, f)),
    };
  }

  async function find(path: string): Promise<FileEntry | null> {
    const { files: entries } = await list(remoteParent(path));
    return entries.find((f) => f.name === remoteName(path)) ?? null;
  }

  async function linkType(entry: FileEntry) {
    if (entry.type !== "link") return;
    try {
      const info = await files.identifySSHSymlink(sessionId(), entry.path);
      entry.targetType = info.type === "directory" ? "directory" : "file";
      entry.linkTarget = info.target ?? entry.linkTarget;
    } catch {
      entry.targetType = null;
    }
  }

  const backend: FileBackend = {
    kind: "relay",

    async home() {
      return (await list(".")).path;
    },

    async list(path) {
      const result = await list(path);
      await mapLimit(
        result.files.filter((f) => f.type === "link"),
        LINK_LOOKUPS,
        linkType,
      );
      return result;
    },

    async stat(path) {
      const entry = await find(path);
      if (!entry)
        throw new AppError(`${remoteName(path)} is gone`, "NOT_FOUND");
      await linkType(entry);
      return entry;
    },

    async mkdir(dir, name) {
      await files.createSSHFolder(sessionId(), dir, name, hostId);
    },

    async createFile(dir, name) {
      await files.createSSHFile(sessionId(), dir, name, "", hostId);
    },

    async rename(path, newName) {
      await files.renameSSHItem(sessionId(), path, newName, hostId);
    },

    async move(path, toDir) {
      const target = joinRemote(toDir, remoteName(path));
      if (target === path) return;
      await files.moveSSHItem(sessionId(), path, target, hostId);
    },

    async copy(path, toDir) {
      await files.copySSHItem(sessionId(), path, toDir, hostId);
    },

    async remove(entries, permanent) {
      for (const entry of entries) {
        try {
          await files.deleteSSHItem(
            sessionId(),
            entry.path,
            entry.type === "directory",
            hostId,
            undefined,
            permanent,
          );
        } catch (error) {
          if (!permanent && isTrashConflict(error)) {
            throw new TrashUnavailableError(
              `${entry.name} can't go to the trash`,
            );
          }
          throw error;
        }
      }
    },

    async chmod(path, mode) {
      await files.changeSSHPermissions(
        sessionId(),
        path,
        (mode & 0o777).toString(8).padStart(3, "0"),
        hostId,
      );
    },

    symlink: null,

    folderSize: async () => null,

    async readText(path) {
      const entry = await find(path);
      const res = await files.readSSHFile(sessionId(), path);
      const binary = res.encoding === "base64";
      return {
        text: binary ? null : (res.content ?? ""),
        size: entry?.size ?? res.content?.length ?? 0,
      };
    },

    async writeText(path, text) {
      await files.writeSSHFile(sessionId(), path, text, hostId);
    },

    async download(remote, localPath, options = {}) {
      const offset = options.offset ?? 0;
      const res = await files.downloadStream(
        sessionId(),
        remote,
        offset,
        options.signal,
      );
      // An older server ignores Range and sends it all again.
      const resumed = offset > 0 && res.status === 206;
      const start = resumed ? offset : 0;
      const length = Number(res.headers.get("Content-Length"));
      const total = Number.isFinite(length) ? start + length : -1;
      const writer = openWriter(localPath, resumed);
      let done = start;
      try {
        const reader = res.body?.getReader();
        if (!reader) throw new AppError("The server sent no file");
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          if (options.signal?.aborted) {
            await reader.cancel().catch(() => {});
            throw new AppError("Cancelled", "CANCELLED");
          }
          writer.write(value);
          done += value.length;
          options.onProgress?.(done, total);
        }
      } finally {
        writer.close();
      }
    },

    async upload(localPath, remoteDir, name, options = {}) {
      const reader = openReader(localPath, options.offset ?? 0);
      let offset = options.offset ?? 0;
      try {
        const total = reader.size;
        if (total === 0) {
          await files.uploadChunk(
            sessionId(),
            remoteDir,
            name,
            0,
            0,
            new Uint8Array(0),
            options.signal,
          );
          options.onProgress?.(0, 0);
          return;
        }
        while (offset < total) {
          if (options.signal?.aborted) {
            throw new AppError("Cancelled", "CANCELLED");
          }
          const bytes = reader.read(Math.min(UPLOAD_CHUNK, total - offset));
          const next = await files.uploadChunk(
            sessionId(),
            remoteDir,
            name,
            offset,
            total,
            bytes,
            options.signal,
          );
          offset = next.nextOffset;
          options.onProgress?.(offset, total);
          if (next.complete) break;
        }
      } finally {
        reader.close();
      }
    },

    async uploadedBytes(remoteDir, name) {
      const entry = await find(joinRemote(remoteDir, name)).catch(() => null);
      return entry?.size ?? 0;
    },

    trash: {
      list: () => files.listSSHTrash(sessionId()),
      async restore(id) {
        await files.restoreSSHTrashItem(sessionId(), id);
      },
      async remove(id) {
        await files.deleteSSHTrashItem(sessionId(), id);
      },
      async empty() {
        await files.emptySSHTrash(sessionId());
      },
    },

    close() {
      void files.disconnectSSH(sessionId()).catch(() => {});
    },
  };
  return backend;
}
