import { drizzle } from "drizzle-orm/expo-sqlite";
import { Platform } from "react-native";
import { Directory, File } from "expo-file-system";
import {
  addDatabaseChangeListener,
  defaultDatabaseDirectory,
  deleteDatabaseSync,
  openDatabaseSync,
} from "expo-sqlite";
import { AppError } from "@/core/errors";
import type { DbDriver, SqlValue } from "./driver";
import { libraryDatabaseDirectory, moveDatabase } from "./location";
import * as schema from "./schema";

// iOS keeps the files out of Documents, which the Files app shows.
const DIRECTORY: string | undefined =
  Platform.OS === "ios"
    ? libraryDatabaseDirectory(String(defaultDatabaseDirectory))
    : undefined;

// Files whose move failed stay in the old folder for this run.
const fallback = new Set<string>();

const fileOps = {
  exists: (path: string) => new File(`file://${path}`).exists,
  move: (from: string, to: string) =>
    new File(`file://${from}`).move(new File(`file://${to}`)),
};

/** expo-sqlite built with SQLCipher (app.json `useSQLCipher`). */
export const expoDriver: DbDriver | null = {
  async prepare(name) {
    if (!DIRECTORY) return;
    new Directory(`file://${DIRECTORY}`).create({
      intermediates: true,
      idempotent: true,
    });
    // Files from before 2.0 builds moved them; a failed move keeps them where they were.
    const result = await moveDatabase(
      name,
      String(defaultDatabaseDirectory),
      DIRECTORY,
      fileOps,
    );
    if (result === "kept") fallback.add(name);
  },
  open(name, keyHex) {
    const sqlite = openDatabaseSync(
      name,
      { enableChangeListener: true },
      fallback.has(name) ? undefined : DIRECTORY,
    );
    try {
      // Raw key form, so SQLCipher skips its own key derivation.
      sqlite.execSync(`PRAGMA key = "x'${keyHex}'"`);
      // PRAGMA key does nothing without SQLCipher, so prove it is there.
      const cipher = sqlite.getFirstSync<{ cipher_version: string }>(
        "PRAGMA cipher_version",
      );
      if (!cipher?.cipher_version) {
        throw new AppError(
          "This build can't encrypt local data.",
          "DB_NOT_ENCRYPTED",
        );
      }
      sqlite.execSync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    } catch (error) {
      sqlite.closeSync();
      throw error;
    }
    return {
      db: drizzle(sqlite, { schema }),
      path: sqlite.databasePath,
      raw: {
        exec: (sql) => sqlite.execSync(sql),
        get: <T>(sql: string) => sqlite.getFirstSync<T>(sql) ?? undefined,
        all: <T>(sql: string, params: SqlValue[] = []) =>
          sqlite.getAllSync<T>(sql, params),
        run: (sql, params = []) => {
          sqlite.runSync(sql, params);
        },
        transaction: (fn) => sqlite.withTransactionSync(fn),
        close: () => sqlite.closeSync(),
      },
    };
  },
  remove(name) {
    for (const dir of [DIRECTORY, undefined]) {
      try {
        deleteDatabaseSync(name, dir);
      } catch {
        // Not in that folder.
      }
    }
    fallback.delete(name);
  },
  onChange(listener) {
    const sub = addDatabaseChangeListener((event) =>
      listener(event.databaseName, event.tableName),
    );
    return () => sub.remove();
  },
};
