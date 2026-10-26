// Where account databases live. iOS keeps them in Library, since the
// Documents folder shows in the Files app (file sharing is on for downloads).

const DB_SUFFIXES = ["", "-wal", "-shm"];

/** The database folder in Library for expo-sqlite's default Documents/SQLite. */
export function libraryDatabaseDirectory(defaultDirectory: string): string {
  return defaultDirectory.replace(
    /\/Documents\/SQLite\/?$/,
    "/Library/Application Support/SQLite",
  );
}

export interface FileOps {
  exists(path: string): boolean;
  move(from: string, to: string): Promise<void>;
}

/**
 * Moves one database and its WAL files from `from` to `to`, once. The three
 * files move together: if one fails, the moved ones go back and the old
 * folder keeps working. Nothing happens when the new folder already has it.
 */
export async function moveDatabase(
  name: string,
  from: string,
  to: string,
  ops: FileOps,
): Promise<"moved" | "kept" | "none"> {
  if (from === to || ops.exists(`${to}/${name}`)) return "none";
  if (!ops.exists(`${from}/${name}`)) return "none";
  const moved: string[] = [];
  try {
    for (const suffix of DB_SUFFIXES) {
      const file = `${name}${suffix}`;
      if (!ops.exists(`${from}/${file}`)) continue;
      await ops.move(`${from}/${file}`, `${to}/${file}`);
      moved.push(file);
    }
    return "moved";
  } catch {
    for (const file of moved.reverse()) {
      await ops.move(`${to}/${file}`, `${from}/${file}`).catch(() => {});
    }
    return "kept";
  }
}
