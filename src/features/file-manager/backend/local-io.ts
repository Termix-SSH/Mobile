import { File, FileMode } from "expo-file-system";

/** Reads or writes a phone file in slices, so nothing big sits in memory at once. */
export interface LocalWriter {
  write(bytes: Uint8Array): void;
  close(): void;
}

export interface LocalReader {
  size: number;
  read(length: number): Uint8Array;
  close(): void;
}

const uri = (path: string) =>
  path.startsWith("file://") || path.startsWith("content://")
    ? path
    : `file://${path}`;

export function openWriter(path: string, append: boolean): LocalWriter {
  const file = new File(uri(path));
  if (!file.exists) file.create({ intermediates: true });
  const handle = file.open(append ? FileMode.Append : FileMode.Truncate);
  return {
    write: (bytes) => handle.writeBytes(bytes),
    close: () => handle.close(),
  };
}

export function openReader(path: string, offset: number): LocalReader {
  const file = new File(uri(path));
  const handle = file.open(FileMode.ReadOnly);
  if (offset > 0) handle.offset = offset;
  return {
    size: file.size,
    read: (length) => handle.readBytes(length),
    close: () => handle.close(),
  };
}

/** Size of a phone file, 0 when it isn't there. */
export function localSize(path: string): number {
  const file = new File(uri(path));
  return file.exists ? file.size : 0;
}

export function removeLocal(path: string): void {
  const file = new File(uri(path));
  if (file.exists) file.delete();
}
