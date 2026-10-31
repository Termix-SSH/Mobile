import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { getTableName } from "drizzle-orm";
import { getRandomBytes } from "expo-crypto";
import { AppError } from "@/core/errors";
import { fromBase64, toBase64, utf8Decode, utf8Encode } from "./bytes";
import type { RawDb, SqlValue } from "./driver";
import { SCHEMA_VERSION } from "./migrate";
import { allTables } from "./schema";

export const BACKUP_FORMAT = "termix-backup";
export const BACKUP_EXTENSION = "termixbackup";

export interface KdfParams {
  N: number;
  r: number;
  p: number;
}

// About 32 MB and a few seconds on a phone, so a guess is slow.
export const DEFAULT_KDF: KdfParams = { N: 2 ** 15, r: 8, p: 1 };

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  schemaVersion: number;
  createdAt: string;
  kdf: KdfParams & { name: "scrypt"; salt: string };
  cipher: "xchacha20poly1305";
  nonce: string;
  data: string;
}

type Dump = Record<string, Record<string, SqlValue>[]>;

const TABLES = Object.values(allTables).map((t) => getTableName(t));

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

function deriveKey(passphrase: string, salt: Uint8Array, kdf: KdfParams) {
  return scryptAsync(utf8Encode(passphrase.normalize("NFKC")), salt, {
    ...kdf,
    dkLen: 32,
  });
}

/** Every row of every table, by SQL column name. */
export function dumpTables(raw: RawDb): Dump {
  const dump: Dump = {};
  for (const table of TABLES) {
    dump[table] = raw.all(`SELECT * FROM ${quote(table)}`);
  }
  return dump;
}

/**
 * Replaces every table with the dump, in one transaction. Columns the file
 * lacks get their defaults, so a backup from an older app still loads.
 */
export function restoreTables(raw: RawDb, dump: Dump): void {
  raw.transaction(() => {
    raw.exec("PRAGMA defer_foreign_keys = ON");
    for (const table of [...TABLES].reverse()) {
      raw.exec(`DELETE FROM ${quote(table)}`);
    }
    for (const table of TABLES) {
      const columns = new Set(
        raw
          .all<{ name: string }>(`PRAGMA table_info(${quote(table)})`)
          .map((c) => c.name),
      );
      for (const row of dump[table] ?? []) {
        const keys = Object.keys(row).filter((k) => columns.has(k));
        if (keys.length === 0) continue;
        raw.run(
          `INSERT INTO ${quote(table)} (${keys.map(quote).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
          keys.map((k) => row[k] ?? null),
        );
      }
    }
  });
}

export async function createBackup(
  raw: RawDb,
  passphrase: string,
  kdf: KdfParams = DEFAULT_KDF,
): Promise<string> {
  if (passphrase.length < 8) {
    throw new AppError(
      "Use a passphrase with at least 8 characters.",
      "VALIDATION_ERROR",
    );
  }
  const salt = getRandomBytes(16);
  const nonce = getRandomBytes(24);
  const key = await deriveKey(passphrase, salt, kdf);
  const plain = utf8Encode(JSON.stringify(dumpTables(raw)));
  const sealed = xchacha20poly1305(key, nonce).encrypt(plain);
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    kdf: { name: "scrypt", ...kdf, salt: toBase64(salt) },
    cipher: "xchacha20poly1305",
    nonce: toBase64(nonce),
    data: toBase64(sealed),
  };
  return JSON.stringify(file);
}

/** Checks and decrypts a backup file. Throws a clear AppError on any problem. */
export async function openBackup(
  content: string,
  passphrase: string,
): Promise<Dump> {
  let file: BackupFile;
  try {
    file = JSON.parse(content);
  } catch {
    throw new AppError("This is not a Termix backup file.", "BACKUP_INVALID");
  }
  if (
    file?.format !== BACKUP_FORMAT ||
    file.version !== 1 ||
    file.cipher !== "xchacha20poly1305" ||
    file.kdf?.name !== "scrypt"
  ) {
    throw new AppError("This is not a Termix backup file.", "BACKUP_INVALID");
  }
  if (file.schemaVersion > SCHEMA_VERSION) {
    throw new AppError(
      "This backup is from a newer version of Termix. Update the app first.",
      "DB_TOO_NEW",
    );
  }
  const { N, r, p } = file.kdf;
  if (![N, r, p].every(Number.isInteger) || N > 2 ** 20 || r > 16 || p > 4) {
    throw new AppError("This is not a Termix backup file.", "BACKUP_INVALID");
  }
  const key = await deriveKey(passphrase, fromBase64(file.kdf.salt), {
    N,
    r,
    p,
  });
  let plain: Uint8Array;
  try {
    plain = xchacha20poly1305(key, fromBase64(file.nonce)).decrypt(
      fromBase64(file.data),
    );
  } catch {
    throw new AppError(
      "Wrong passphrase, or the file is damaged.",
      "BACKUP_WRONG_PASSPHRASE",
    );
  }
  return JSON.parse(utf8Decode(plain)) as Dump;
}
