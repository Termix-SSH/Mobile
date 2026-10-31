import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { utf8Encode } from "@/core/db/bytes";
import type { SyncRow } from "./protocol";

/** Keys that say where a row lives rather than what it says. */
const LOCATION_KEYS = new Set(["id", "syncId", "createdAt", "updatedAt"]);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        if (object[key] !== undefined) acc[key] = stable(object[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Same leveling as the server: booleans as 0/1, JSON text parsed. */
function normalize(value: unknown): unknown {
  if (value === true) return 1;
  if (value === false) return 0;
  if (value === undefined) return null;
  if (typeof value === "string" && /^[[{]/.test(value)) {
    try {
      return stable(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return stable(value);
}

/**
 * What a wire row says, as a hash. Only compared on this phone: it tells
 * whether a row changed since the server last saw it.
 */
export function hashRow(row: SyncRow): string {
  const content: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(row)) {
    if (LOCATION_KEYS.has(field)) continue;
    const normalized = normalize(value);
    if (normalized === null || normalized === "") continue;
    content[field] = normalized;
  }
  return bytesToHex(sha256(utf8Encode(JSON.stringify(stable(content)))));
}
