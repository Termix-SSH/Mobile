import type { TrashItem } from "@/core/api/types";

export type FileType = "file" | "directory" | "link";

export interface FileEntry {
  name: string;
  path: string;
  type: FileType;
  size: number;
  /** Seconds since the epoch, or null when unknown. */
  mtime: number | null;
  atime?: number | null;
  /** Permission bits (0o7777), or null when unknown. */
  mode: number | null;
  owner?: string | null;
  group?: string | null;
  uid?: number | null;
  gid?: number | null;
  linkTarget?: string | null;
  /** What a link points at, when it could be read. */
  targetType?: "file" | "directory" | null;
}

export interface TransferProgress {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface DownloadOptions extends TransferProgress {
  /** Bytes already on the phone, to resume after. */
  offset?: number;
}

export interface UploadOptions extends TransferProgress {
  /** Bytes already on the host, to resume after. */
  offset?: number;
}

export interface TextRead {
  /** Null when the file looks binary. */
  text: string | null;
  size: number;
}

export interface TrashApi {
  list(): Promise<{ items: TrashItem[]; retentionDays: number }>;
  restore(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  empty(): Promise<void>;
}

/**
 * One file manager, two ways to reach the files: the phone's own SFTP
 * connection, or the server's File Manager plugin.
 */
export interface FileBackend {
  kind: "sftp" | "relay";
  home(): Promise<string>;
  list(path: string): Promise<{ path: string; files: FileEntry[] }>;
  stat(path: string): Promise<FileEntry>;
  mkdir(dir: string, name: string): Promise<void>;
  createFile(dir: string, name: string): Promise<void>;
  rename(path: string, newName: string): Promise<void>;
  move(path: string, toDir: string): Promise<void>;
  /** Copies into `toDir`; a name that is taken gets a `_copy_` suffix like the web. */
  copy(path: string, toDir: string): Promise<void>;
  /** Moves to the trash, or deletes for good when `permanent`. */
  remove(entries: FileEntry[], permanent: boolean): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  /** Makes `path` a link to `target`. Null when this backend can't. */
  symlink: ((path: string, target: string) => Promise<void>) | null;
  /** Total size of a folder, when the host can tell. */
  folderSize(path: string): Promise<number | null>;
  readText(path: string, maxBytes: number): Promise<TextRead>;
  writeText(path: string, text: string): Promise<void>;
  /** Writes the remote file to a local path (no file://), from `offset` on. */
  download(
    remote: string,
    localPath: string,
    options?: DownloadOptions,
  ): Promise<void>;
  /** Sends a local path (no file://) to `remoteDir/name`, from `offset` on. */
  upload(
    localPath: string,
    remoteDir: string,
    name: string,
    options?: UploadOptions,
  ): Promise<void>;
  /** How much of `remoteDir/name` is already on the host, for a resumed upload. */
  uploadedBytes(remoteDir: string, name: string): Promise<number>;
  trash: TrashApi | null;
  close(): void;
}
