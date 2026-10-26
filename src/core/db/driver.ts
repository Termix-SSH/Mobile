import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

/** The typed Drizzle handle. Sync mode, like expo-sqlite and better-sqlite3. */
export type LocalDb = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

export type SqlValue = string | number | null | Uint8Array;

/** The few raw calls the migrations runner and backups need. */
export interface RawDb {
  exec(sql: string): void;
  get<T>(sql: string): T | undefined;
  all<T>(sql: string, params?: SqlValue[]): T[];
  run(sql: string, params?: SqlValue[]): void;
  transaction(fn: () => void): void;
  close(): void;
}

export interface OpenedDb {
  db: LocalDb;
  raw: RawDb;
  /** File path, for size and backup exclusion. Null for in memory. */
  path: string | null;
}

/** Opens one account's file with its key. Tests swap this for better-sqlite3. */
export interface DbDriver {
  open(name: string, keyHex: string): OpenedDb;
  remove(name: string): void;
  /** Runs before the first open of a file, for one time moves. */
  prepare?(name: string): Promise<void>;
  /** Calls back with the SQL table name after any write to the file. */
  onChange?(listener: (name: string, table: string) => void): () => void;
}
