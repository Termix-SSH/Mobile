import type { FileBackend, FileEntry } from "./backend/types";

/** Most files a folder download takes, so a slip on / doesn't queue a disk. */
export const MAX_FOLDER_FILES = 5000;

export interface WalkedFile {
  entry: FileEntry;
  /** Folders between the downloaded folder (included) and the file. */
  relative: string[];
}

/**
 * Every file under `folder`, depth first, not following links to folders.
 * Throws when there are more than `limit`.
 */
export async function walkFolder(
  backend: FileBackend,
  folder: FileEntry,
  limit = MAX_FOLDER_FILES,
  signal?: AbortSignal,
): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];
  const stack: { path: string; relative: string[] }[] = [
    { path: folder.path, relative: [folder.name] },
  ];
  while (stack.length) {
    if (signal?.aborted) throw new Error("Cancelled");
    const next = stack.pop()!;
    const { files } = await backend.list(next.path);
    for (const entry of files) {
      if (entry.type === "directory") {
        stack.push({
          path: entry.path,
          relative: [...next.relative, entry.name],
        });
      } else if (entry.type === "file" || entry.targetType === "file") {
        out.push({ entry, relative: next.relative });
        if (out.length > limit) {
          throw new Error(
            `${folder.name} has more than ${limit} files. Download smaller folders.`,
          );
        }
      }
    }
  }
  return out;
}

/** What the list shows: hidden files when wanted, and names that match the search. */
export function visibleFiles(
  files: FileEntry[],
  query: string,
  showHidden: boolean,
): FileEntry[] {
  const q = query.trim().toLowerCase();
  return files.filter(
    (f) =>
      (showHidden || !f.name.startsWith(".")) &&
      (!q || f.name.toLowerCase().includes(q)),
  );
}

/** A name a new file or folder may have. */
export function validName(name: string): boolean {
  const n = name.trim();
  return (
    !!n && n !== "." && n !== ".." && !n.includes("/") && !n.includes("\0")
  );
}

/** Text files open in the editor without asking up to this size. */
export const EDITOR_SOFT_LIMIT = 1024 * 1024;
/** Bigger files are not opened in the editor at all. */
export const EDITOR_HARD_LIMIT = 10 * 1024 * 1024;

export type OpenPlan =
  | { kind: "folder" }
  | { kind: "text"; ask: boolean }
  | { kind: "tooBig" }
  | { kind: "preview" }
  | { kind: "other" };

/** How tapping a file opens it. */
export function openPlan(
  file: FileEntry,
  isText: boolean,
  canPreview: boolean,
): OpenPlan {
  if (
    file.type === "directory" ||
    (file.type === "link" && file.targetType === "directory")
  ) {
    return { kind: "folder" };
  }
  if (canPreview) return { kind: "preview" };
  if (!isText) return { kind: "other" };
  if (file.size > EDITOR_HARD_LIMIT) return { kind: "tooBig" };
  return { kind: "text", ask: file.size > EDITOR_SOFT_LIMIT };
}
