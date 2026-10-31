// Fills the keys a host inherits and tells which ones it sets itself. The
// same rules as core's write-rules.ts (create) and materialize.ts (a default
// changed), on one host row at a time.
import { readCoreDefault, writeCoreDefault, type Columns } from "./columns";
import {
  levelsForHost,
  isOwnValue,
  resolveKey,
  withoutSelfJump,
  type DefaultsIndex,
  type HostLevels,
} from "./resolve";
import {
  CORE_NAMESPACE,
  coreKeyInfo,
  defaultValuesEqual,
  parseOverrides,
  pluginKeyInfo,
  splitKey,
  type DefaultOverrides,
  type KeyInfo,
  type ResolvedDefault,
} from "./values";

type PluginSettings = Record<string, Record<string, unknown>>;

export interface DefaultsPlan {
  columns: Columns;
  overrides: DefaultOverrides;
  pluginSettings: PluginSettings;
  /** Whether any column, plugin value or the overrides differ from the input. */
  changed: boolean;
}

export interface PlanInput {
  columns: Columns;
  index: DefaultsIndex;
  /** The host's id, or null for a host not saved yet. */
  hostId?: number | null;
  /** Stored overrides. Null classifies the host from its current values. */
  overrides?: DefaultOverrides | null;
  /** Core keys the writer left out, which inherit on create. */
  leftOut?: Set<string>;
  pluginSettings?: PluginSettings;
  /** Fill plugin keys the host has no value for. */
  fillPlugins?: boolean;
  /** The folder whose defaults apply, when it is not the host's own (sub-hosts). */
  folder?: string | null;
}

const CORE_INFO = coreKeyInfo();

export function resolveForHost(
  info: KeyInfo,
  levels: HostLevels,
  hostId: number | null,
): ResolvedDefault | undefined {
  const resolved = resolveKey(info, levels);
  if (!resolved || hostId === null || info.fullKey !== "core.jumpHosts") {
    return resolved;
  }
  return { ...resolved, value: withoutSelfJump(resolved.value, hostId) };
}

/** Every plugin key some level sets, for the levels a host reads. */
export function pluginKeysIn(levels: HostLevels): KeyInfo[] {
  const seen = new Map<string, KeyInfo>();
  const maps = [
    levels.admin,
    levels.user,
    ...levels.folders.map((f) => f.values),
  ];
  for (const map of maps) {
    for (const fullKey of map.keys()) {
      const [namespace, key] = splitKey(fullKey);
      if (namespace === CORE_NAMESPACE || seen.has(fullKey)) continue;
      seen.set(fullKey, pluginKeyInfo(namespace, key));
    }
  }
  return [...seen.values()];
}

export function planHostDefaults(input: PlanInput): DefaultsPlan {
  const hostId = input.hostId ?? null;
  const folder =
    input.folder !== undefined
      ? input.folder
      : ((input.columns.folder as string | null | undefined) ?? null);
  const levels = levelsForHost(input.index, folder);
  const columns: Columns = { ...input.columns };
  const leftOut = input.leftOut ?? new Set<string>();
  const stored = input.overrides ?? null;
  const classify = !stored?.[CORE_NAMESPACE];

  const own = new Set<string>(stored?.[CORE_NAMESPACE] ?? []);
  if (classify) {
    for (const info of CORE_INFO) {
      if (leftOut.has(info.key)) continue;
      const incoming = readCoreDefault(info.key, columns);
      if (isOwnValue(info, incoming, resolveForHost(info, levels, hostId))) {
        own.add(info.key);
      }
    }
  }

  for (const info of CORE_INFO) {
    if (own.has(info.key)) continue;
    const resolved = resolveForHost(info, levels, hostId);
    if (!resolved) continue;
    const desired = info.normalize(resolved.value);
    if (defaultValuesEqual(readCoreDefault(info.key, columns), desired)) {
      continue;
    }
    Object.assign(columns, writeCoreDefault(info.key, desired, columns));
  }

  const pluginSettings: PluginSettings = {};
  for (const [id, values] of Object.entries(input.pluginSettings ?? {})) {
    pluginSettings[id] = { ...values };
  }
  if (input.fillPlugins) {
    for (const info of pluginKeysIn(levels)) {
      if (pluginSettings[info.namespace]?.[info.key] !== undefined) continue;
      const resolved = resolveKey(info, levels);
      if (!resolved) continue;
      pluginSettings[info.namespace] = {
        ...(pluginSettings[info.namespace] ?? {}),
        [info.key]: resolved.value,
      };
    }
  }

  const overrides: DefaultOverrides = {
    ...(stored ?? {}),
    [CORE_NAMESPACE]: [...own].sort(),
  };
  const changed =
    classify ||
    JSON.stringify(columns) !== JSON.stringify(input.columns) ||
    JSON.stringify(pluginSettings) !==
      JSON.stringify(input.pluginSettings ?? {});
  return { columns, overrides, pluginSettings, changed };
}

/** The stored overrides of a row, or null when it was never classified. */
export function storedOverrides(raw: unknown): DefaultOverrides | null {
  return parseOverrides(raw);
}

/**
 * An edit makes every core key whose value changed the host's own. A host
 * that was never classified returns null and is classified from its values.
 */
export function overridesAfterEdit(
  before: DefaultOverrides | null,
  oldColumns: Columns,
  newColumns: Columns,
): DefaultOverrides | null {
  if (!before?.[CORE_NAMESPACE]) return null;
  const own = new Set(before[CORE_NAMESPACE]);
  for (const info of CORE_INFO) {
    if (
      !defaultValuesEqual(
        readCoreDefault(info.key, newColumns),
        readCoreDefault(info.key, oldColumns),
      )
    ) {
      own.add(info.key);
    }
  }
  return { ...before, [CORE_NAMESPACE]: [...own].sort() };
}
