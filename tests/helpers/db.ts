import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { DbDriver, LocalDb, OpenedDb } from "@/core/db/driver";
import * as schema from "@/core/db/schema";
import { LocalStores } from "@/core/db/stores";

/** Opens a plain SQLite file, the same shape the SQLCipher driver gives. */
export function openTestDb(file: string): OpenedDb {
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  return {
    db: drizzle(sqlite, { schema }) as unknown as LocalDb,
    path: file,
    raw: {
      exec: (sql) => {
        sqlite.exec(sql);
      },
      get: <T>(sql: string) => sqlite.prepare(sql).get() as T | undefined,
      all: <T>(sql: string, params: unknown[] = []) =>
        sqlite.prepare(sql).all(...params) as T[],
      run: (sql, params = []) => {
        sqlite.prepare(sql).run(...params);
      },
      transaction: (fn) => sqlite.transaction(fn)(),
      close: () => sqlite.close(),
    },
  };
}

export interface TestDriver extends DbDriver {
  dir: string;
  keys: Map<string, string>;
  file(name: string): string;
}

/** better-sqlite3 files in a temp folder. Records the key each file got. */
export function testDriver(): TestDriver {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termix-db-"));
  const keys = new Map<string, string>();
  const file = (name: string) => path.join(dir, name);
  return {
    dir,
    keys,
    file,
    open(name, keyHex) {
      keys.set(name, keyHex);
      return openTestDb(file(name));
    },
    remove(name) {
      for (const suffix of ["", "-wal", "-shm"]) {
        fs.rmSync(file(name) + suffix, { force: true });
      }
    },
  };
}

/** A fresh, unlocked store set on a temp folder. */
export function testStores(): { stores: LocalStores; driver: TestDriver } {
  const driver = testDriver();
  const stores = new LocalStores(driver);
  stores.unlock();
  return { stores, driver };
}
