import { randomUUID } from "expo-crypto";
import type { TrashItem } from "@/core/api/types";
import { utf8Decode, type SshSftp } from "@/modules/termix-ssh";
import { joinRemote, remoteName } from "./paths";

// The same layout as Plugin-File-Manager's trash-service.ts, so the web app
// and the phone see one trash per host user.

const TRASH_DIR = ".termix-trash";
const ID_PATTERN = /^[0-9a-f-]{36}$/i;
export const RETENTION_DAYS = 7;

type Stored = TrashItem & { trashPath: string };
type Dirs = { root: string; files: string; info: string };

async function exists(sftp: SshSftp, path: string) {
  try {
    await sftp.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(sftp: SshSftp, path: string) {
  if (await exists(sftp, path)) return;
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    current += `/${part}`;
    if (await exists(sftp, current)) continue;
    try {
      await sftp.mkdir(current);
    } catch (error) {
      if (!(await exists(sftp, current))) throw error;
    }
  }
}

const dirsBySftp = new WeakMap<SshSftp, Promise<Dirs>>();

function trashDirs(sftp: SshSftp): Promise<Dirs> {
  let dirs = dirsBySftp.get(sftp);
  if (!dirs) {
    dirs = (async () => {
      const home = await sftp.realpath(".");
      const root = joinRemote(home, TRASH_DIR);
      const files = joinRemote(root, "files");
      const info = joinRemote(root, "info");
      await Promise.all([ensureDir(sftp, files), ensureDir(sftp, info)]);
      return { root, files, info };
    })();
    dirsBySftp.set(sftp, dirs);
    dirs.catch(() => dirsBySftp.delete(sftp));
  }
  return dirs;
}

function normalize(path: string) {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function isSafeTrashSource(path: string, root: string): boolean {
  const normalized = normalize(path);
  return (
    normalized !== "/" &&
    normalized !== root &&
    !normalized.startsWith(`${root}/`)
  );
}

function publicItem({ trashPath: _trashPath, ...item }: Stored): TrashItem {
  return item;
}

async function readStored(sftp: SshSftp, dirs: Dirs, id: string) {
  if (!ID_PATTERN.test(id)) throw new Error("Invalid trash item id");
  const raw = await sftp.readFile(joinRemote(dirs.info, `${id}.json`));
  const parsed = JSON.parse(utf8Decode(raw)) as Stored;
  if (
    parsed.id !== id ||
    parsed.trashPath !== joinRemote(dirs.files, id) ||
    !isSafeTrashSource(parsed.originalPath, dirs.root)
  ) {
    throw new Error("Invalid trash metadata");
  }
  return parsed;
}

export async function moveToTrash(
  sftp: SshSftp,
  path: string,
): Promise<TrashItem> {
  const dirs = await trashDirs(sftp);
  if (!isSafeTrashSource(path, dirs.root)) {
    throw new Error("This path can't be moved to the trash");
  }
  const stat = await sftp.lstat(path);
  const id = randomUUID();
  const item: Stored = {
    id,
    name: remoteName(path),
    originalPath: path,
    trashPath: joinRemote(dirs.files, id),
    isDirectory: stat.isDir,
    deletedAt: new Date().toISOString(),
    size: stat.size,
  };
  await sftp.rename(path, item.trashPath);
  try {
    await sftp.writeFile(
      joinRemote(dirs.info, `${id}.json`),
      JSON.stringify(item),
    );
  } catch (error) {
    await sftp.rename(item.trashPath, path).catch(() => {});
    throw error;
  }
  return publicItem(item);
}

export async function listTrash(
  sftp: SshSftp,
  retentionDays = RETENTION_DAYS,
): Promise<TrashItem[]> {
  const dirs = await trashDirs(sftp);
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const items: TrashItem[] = [];
  for (const entry of await sftp.list(dirs.info)) {
    if (!entry.name.endsWith(".json")) continue;
    const info = joinRemote(dirs.info, entry.name);
    try {
      const item = await readStored(sftp, dirs, entry.name.slice(0, -5));
      const there = await exists(sftp, item.trashPath);
      if (new Date(item.deletedAt).getTime() < cutoff) {
        if (there) await sftp.removeRecursive(item.trashPath);
        await sftp.remove(info);
      } else if (there) {
        items.push(publicItem(item));
      } else {
        await sftp.remove(info);
      }
    } catch {
      // Corrupt metadata is left alone, never trusted as a path.
    }
  }
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function restoreTrashItem(sftp: SshSftp, id: string) {
  const dirs = await trashDirs(sftp);
  const item = await readStored(sftp, dirs, id);
  if (await exists(sftp, item.originalPath)) {
    throw new Error("A file already exists at the original path");
  }
  await sftp.rename(item.trashPath, item.originalPath);
  await sftp.remove(joinRemote(dirs.info, `${id}.json`));
}

export async function deleteTrashItem(sftp: SshSftp, id: string) {
  const dirs = await trashDirs(sftp);
  const item = await readStored(sftp, dirs, id);
  if (await exists(sftp, item.trashPath)) {
    await sftp.removeRecursive(item.trashPath);
  }
  await sftp.remove(joinRemote(dirs.info, `${id}.json`));
}

export async function emptyTrash(sftp: SshSftp) {
  for (const item of await listTrash(sftp, 365_000)) {
    await deleteTrashItem(sftp, item.id);
  }
}
