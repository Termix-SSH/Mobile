// No storage here: the levels come in as maps, like core's resolve.ts.
import {
  defaultValuesEqual,
  type DefaultSource,
  type KeyInfo,
  type ResolvedDefault,
} from "./values";

export type LevelMap = Map<string, unknown>;

export interface FolderLevel {
  name: string;
  values: LevelMap;
}

/** The three levels a host reads, root folder first. */
export interface HostLevels {
  admin: LevelMap;
  user: LevelMap;
  folders: FolderLevel[];
}

/** Every level the phone knows, by folder name. */
export interface DefaultsIndex {
  admin: LevelMap;
  user: LevelMap;
  folders: Map<string, FolderLevel>;
}

export const FOLDER_SEPARATOR = " / ";

export const emptyIndex = (): DefaultsIndex => ({
  admin: new Map(),
  user: new Map(),
  folders: new Map(),
});

/** "A / B / C" -> ["A", "A / B", "A / B / C"]. */
export function folderChainPaths(path: string | null | undefined): string[] {
  if (!path) return [];
  const segments = path.split(FOLDER_SEPARATOR).filter(Boolean);
  return segments.map((_, index) =>
    segments.slice(0, index + 1).join(FOLDER_SEPARATOR),
  );
}

export interface HostPlacement {
  folder: string | null;
  parentHostId: number | null;
}

/**
 * The folder whose defaults a host follows. A sub-host has no folder of its
 * own, so it takes the nearest ancestor's, like core.
 */
export function effectiveFolderPath(
  own: HostPlacement,
  placement: Map<number, HostPlacement>,
): string | null {
  const seen = new Set<number>();
  let current: HostPlacement | undefined = own;
  while (current) {
    if (current.folder) return current.folder;
    const parent = current.parentHostId;
    if (parent === null || seen.has(parent)) return null;
    seen.add(parent);
    current = placement.get(parent);
  }
  return null;
}

export function levelsForHost(
  index: DefaultsIndex,
  folderPath: string | null | undefined,
): HostLevels {
  const folders: FolderLevel[] = [];
  for (const path of folderChainPaths(folderPath)) {
    const folder = index.folders.get(path);
    if (folder) folders.push(folder);
  }
  return { admin: index.admin, user: index.user, folders };
}

/**
 * A key resolves from the deepest folder up to the root folder, then the
 * user's own defaults, then the server's, then the key's built-in value. A
 * level the key does not allow is skipped.
 */
export function resolveKey(
  info: KeyInfo,
  levels: HostLevels,
): ResolvedDefault | undefined {
  const allowed = new Set(info.levels);
  if (allowed.has("folder")) {
    for (let i = levels.folders.length - 1; i >= 0; i--) {
      const folder = levels.folders[i];
      if (folder.values.has(info.fullKey)) {
        return {
          value: info.normalize(folder.values.get(info.fullKey)),
          source: { level: "folder", folderName: folder.name },
        };
      }
    }
  }
  const order: ["user" | "admin", LevelMap][] = [
    ["user", levels.user],
    ["admin", levels.admin],
  ];
  for (const [level, values] of order) {
    if (allowed.has(level) && values.has(info.fullKey)) {
      return {
        value: info.normalize(values.get(info.fullKey)),
        source: { level },
      };
    }
  }
  if (info.builtin === undefined) return undefined;
  const source: DefaultSource = { level: "builtin" };
  return { value: info.normalize(info.builtin), source };
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

/**
 * Whether a host's value is its own rather than the default: it differs from
 * what resolves, or nothing resolves and the host has a value at all.
 */
export function isOwnValue(
  info: KeyInfo,
  hostValue: unknown,
  resolved: ResolvedDefault | undefined,
): boolean {
  const own = info.normalize(hostValue);
  if (!resolved) return !isEmpty(own);
  return !defaultValuesEqual(own, resolved.value);
}

/** A host never jumps through itself, even when a folder default says to. */
export function withoutSelfJump(value: unknown, hostId: number): unknown {
  if (!Array.isArray(value)) return value;
  return value.filter(
    (entry) => Number((entry as { hostId?: unknown })?.hostId) !== hostId,
  );
}
