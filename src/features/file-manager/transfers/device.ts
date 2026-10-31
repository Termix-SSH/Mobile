import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { plainStore } from "@/core/storage/kv";
import { toLocalPath } from "../backend/paths";

const SAVE_DIR_KEY = "files.saveDir";

/** Strips what a phone file system won't take from a host or file name. */
export function safeName(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, "_").trim();
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "file";
}

/** `name`, or `name (2).ext` and so on, so nothing on the phone is overwritten. */
export function freeName(name: string, taken: (name: string) => boolean) {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i++) {
    const next = `${base} (${i})${ext}`;
    if (!taken(next)) return next;
  }
}

/**
 * Where downloads land: Documents/Termix/<host>. On iOS the Files app shows
 * this folder under On My iPhone, Termix.
 */
export function downloadsDir(hostName: string, ...sub: string[]): Directory {
  const dir = new Directory(
    Paths.document,
    "Termix",
    safeName(hostName),
    ...sub.map(safeName),
  );
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** A free plain path for `name` in `dir`, also skipping names in `reserved`. */
export function localTarget(
  dir: Directory,
  name: string,
  reserved: Set<string> = new Set(),
): string {
  const free = freeName(
    safeName(name),
    (n) => reserved.has(n) || new File(dir, n).exists,
  );
  reserved.add(free);
  return toLocalPath(new File(dir, free).uri);
}

/** A cache file to open or preview, wiped by the system when space runs low. */
export function previewTarget(name: string): string {
  const dir = new Directory(Paths.cache, "termix-open", `${Date.now()}`);
  dir.create({ intermediates: true, idempotent: true });
  return toLocalPath(new File(dir, safeName(name)).uri);
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  heic: "image/heic",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  json: "application/json",
  txt: "text/plain",
  log: "text/plain",
  md: "text/markdown",
  html: "text/html",
  csv: "text/csv",
};

export function mimeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

const fileUri = (path: string) =>
  path.startsWith("file://") ? path : new File(`file://${path}`).uri;

/** The system share sheet for one phone file (Save to Files, AirDrop, other apps). */
export async function shareFile(path: string, name: string) {
  await Sharing.shareAsync(fileUri(path), {
    mimeType: mimeFor(name),
    dialogTitle: name,
  });
}

/** Hands a phone file to another app that can open it. */
export async function openWith(path: string, name: string) {
  if (Platform.OS !== "android") {
    await shareFile(path, name);
    return;
  }
  const { startActivityAsync } = await import("expo-intent-launcher");
  const file = new File(fileUri(path));
  await startActivityAsync("android.intent.action.VIEW", {
    data: file.contentUri,
    type: mimeFor(name),
    // FLAG_GRANT_READ_URI_PERMISSION
    flags: 1,
  });
}

async function pickSaveDir(ask: boolean): Promise<Directory | null> {
  if (!ask) {
    const saved = await plainStore.get(SAVE_DIR_KEY);
    if (saved) {
      const dir = new Directory(saved);
      try {
        if (dir.exists) return dir;
      } catch {
        // The folder or its permission is gone; ask again.
      }
    }
  }
  try {
    const dir = await Directory.pickDirectoryAsync();
    await plainStore.set(SAVE_DIR_KEY, dir.uri);
    return dir;
  } catch {
    return null;
  }
}

function subDir(root: Directory, parts: string[]): Directory {
  let dir = root;
  for (const part of parts) {
    const existing = dir
      .list()
      .find((e) => e instanceof Directory && e.name === part);
    dir = (existing as Directory | undefined) ?? dir.createDirectory(part);
  }
  return dir;
}

/**
 * Android: copies downloaded files into a folder the user picked once (any
 * folder, SD card or cloud app), keeping their folder layout. Returns how many
 * were saved, or null when no folder was picked.
 */
export async function saveToFolder(
  files: { path: string; relative: string[] }[],
  options: { askAgain?: boolean } = {},
): Promise<number | null> {
  const root = await pickSaveDir(!!options.askAgain);
  if (!root) return null;
  let saved = 0;
  for (const item of files) {
    const source = new File(fileUri(item.path));
    const dir = subDir(root, item.relative.map(safeName));
    const taken = new Set(
      dir
        .list()
        .filter((e) => e instanceof File)
        .map((e) => e.name),
    );
    const name = freeName(source.name, (n) => taken.has(n));
    const target = dir.createFile(name, mimeFor(name));
    await source.copy(target, { overwrite: true });
    saved++;
  }
  return saved;
}

export const canSaveToFolder = Platform.OS === "android";
