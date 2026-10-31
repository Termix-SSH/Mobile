// Host default keys and how their values compare. A port of core's
// src/types/host-defaults.ts, so the phone resolves a host the same way the
// web does. Keep the two in step.

export type DefaultsLevel = "admin" | "user" | "folder";

export const CORE_NAMESPACE = "core";

/** Namespace -> keys the host sets itself. */
export type DefaultOverrides = Record<string, string[]>;

export interface DefaultSource {
  level: DefaultsLevel | "builtin";
  folderName?: string;
}

export interface ResolvedDefault {
  value: unknown;
  source: DefaultSource;
}

export interface AuthDefault {
  authType: string;
  credentialId: number | null;
  overrideCredentialUsername: boolean;
  agentSocketPath: string | null;
  agentIdentity: string | null;
}

export interface Socks5Default {
  useSocks5: boolean;
  socks5Host: string | null;
  socks5Port: number | null;
  socks5Username: string | null;
  socks5ProxyChain: unknown[] | null;
}

export interface KeyInfo {
  namespace: string;
  key: string;
  fullKey: string;
  levels: readonly DefaultsLevel[];
  /** Undefined when nothing is inherited unless some level sets it. */
  builtin: unknown;
  normalize: (value: unknown) => unknown;
}

const ALL_LEVELS: readonly DefaultsLevel[] = ["admin", "user", "folder"];
const OWN_LEVELS: readonly DefaultsLevel[] = ["user", "folder"];

export function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 1 || value === "true" || value === "1") {
    return true;
  }
  if (value === false || value === 0 || value === "false" || value === "0") {
    return false;
  }
  return fallback;
}

export function toNumber(
  value: unknown,
  fallback: number | null,
): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toArray(value: unknown): unknown[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed : [];
}

export function toObject(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

export function normalizeAuthDefault(value: unknown): AuthDefault | null {
  const source = toObject(value);
  if (!source || typeof source.authType !== "string" || !source.authType) {
    return null;
  }
  const authType = source.authType;
  return {
    authType,
    credentialId:
      authType === "credential" ? toNumber(source.credentialId, null) : null,
    overrideCredentialUsername:
      authType === "credential"
        ? toBoolean(source.overrideCredentialUsername, false)
        : false,
    agentSocketPath:
      authType === "agent" ? toText(source.agentSocketPath) : null,
    agentIdentity: authType === "agent" ? toText(source.agentIdentity) : null,
  };
}

export function normalizeSocks5Default(value: unknown): Socks5Default {
  const source = toObject(value) ?? {};
  if (!toBoolean(source.useSocks5, false)) {
    return {
      useSocks5: false,
      socks5Host: null,
      socks5Port: null,
      socks5Username: null,
      socks5ProxyChain: null,
    };
  }
  const chain = toArray(source.socks5ProxyChain);
  if (chain.length > 0) {
    return {
      useSocks5: true,
      socks5Host: null,
      socks5Port: null,
      socks5Username: null,
      socks5ProxyChain: chain.map((node) => {
        const { password: _password, ...rest } = toObject(node) ?? {};
        return rest;
      }),
    };
  }
  return {
    useSocks5: true,
    socks5Host: toText(source.socks5Host),
    socks5Port: toNumber(source.socks5Port, 1080),
    socks5Username: toText(source.socks5Username),
    socks5ProxyChain: null,
  };
}

function normalizeJumpHosts(value: unknown): { hostId: number }[] {
  return toArray(value)
    .map((entry) => toNumber(toObject(entry)?.hostId, null))
    .filter((hostId): hostId is number => hostId !== null)
    .map((hostId) => ({ hostId }));
}

function normalizePortKnock(value: unknown): unknown[] {
  return toArray(value).map((entry) => {
    const own = toObject(entry) ?? {};
    return {
      port: toNumber(own.port, 0),
      protocol: own.protocol === "udp" ? "udp" : "tcp",
      delay: toNumber(own.delay, 0),
    };
  });
}

export function normalizeEnvironment(
  value: unknown,
): { key: string; value: string }[] {
  return toArray(value).map((entry) => {
    const own = toObject(entry) ?? {};
    return { key: String(own.key ?? ""), value: String(own.value ?? "") };
  });
}

interface CoreKey {
  key: string;
  levels: readonly DefaultsLevel[];
  builtin: unknown;
  normalize: (value: unknown) => unknown;
}

export const CORE_KEYS: readonly CoreKey[] = [
  {
    key: "username",
    levels: ALL_LEVELS,
    builtin: undefined,
    normalize: toText,
  },
  {
    key: "sshPort",
    levels: ALL_LEVELS,
    builtin: 22,
    normalize: (value) => {
      const port = toNumber(value, 22);
      return port !== null && Number.isInteger(port) && port > 0 && port < 65536
        ? port
        : 22;
    },
  },
  {
    key: "auth",
    levels: ALL_LEVELS,
    builtin: undefined,
    normalize: normalizeAuthDefault,
  },
  {
    key: "forceKeyboardInteractive",
    levels: ALL_LEVELS,
    builtin: false,
    normalize: (value) => toBoolean(value, false),
  },
  {
    key: "keepaliveInterval",
    levels: ALL_LEVELS,
    builtin: 60,
    normalize: (value) => toNumber(value, 60),
  },
  {
    key: "keepaliveCountMax",
    levels: ALL_LEVELS,
    builtin: 5,
    normalize: (value) => toNumber(value, 5),
  },
  {
    key: "allowLegacyAlgorithms",
    levels: ALL_LEVELS,
    builtin: true,
    normalize: (value) => toBoolean(value, true),
  },
  {
    key: "agentForwarding",
    levels: ALL_LEVELS,
    builtin: false,
    normalize: (value) => toBoolean(value, false),
  },
  {
    key: "environmentVariables",
    levels: ALL_LEVELS,
    builtin: [],
    normalize: normalizeEnvironment,
  },
  {
    key: "socks5",
    levels: ALL_LEVELS,
    builtin: normalizeSocks5Default(null),
    normalize: normalizeSocks5Default,
  },
  {
    key: "jumpHosts",
    levels: OWN_LEVELS,
    builtin: [],
    normalize: normalizeJumpHosts,
  },
  {
    key: "portKnockSequence",
    levels: ALL_LEVELS,
    builtin: [],
    normalize: normalizePortKnock,
  },
  {
    key: "statusCheckEnabled",
    levels: ALL_LEVELS,
    builtin: true,
    normalize: (value) => toBoolean(value, true),
  },
  {
    key: "statusCheckInterval",
    levels: ALL_LEVELS,
    builtin: null,
    normalize: (value) => {
      const interval = toNumber(value, null);
      return interval !== null && interval > 0 ? Math.round(interval) : null;
    },
  },
];

export const joinKey = (namespace: string, key: string) =>
  `${namespace}.${key}`;

/** "core.sshPort" -> ["core", "sshPort"]. The plugin id never has a dot. */
export function splitKey(fullKey: string): [string, string] {
  const dot = fullKey.indexOf(".");
  if (dot <= 0) return [CORE_NAMESPACE, fullKey];
  return [fullKey.slice(0, dot), fullKey.slice(dot + 1)];
}

export function coreKeyInfo(): KeyInfo[] {
  return CORE_KEYS.map((entry) => ({
    namespace: CORE_NAMESPACE,
    key: entry.key,
    fullKey: joinKey(CORE_NAMESPACE, entry.key),
    levels: entry.levels,
    builtin: entry.builtin,
    normalize: entry.normalize,
  }));
}

/**
 * A key of a plugin the phone has no manifest for. Its value is kept as the
 * server sent it, and nothing is inherited unless some level sets it.
 */
export function pluginKeyInfo(namespace: string, key: string): KeyInfo {
  return {
    namespace,
    key,
    fullKey: joinKey(namespace, key),
    levels: ALL_LEVELS,
    builtin: undefined,
    normalize: (value) => (value === undefined ? null : value),
  };
}

/** JSON with sorted object keys, so equal values stringify the same. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

export function defaultValuesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** A stored or sent overrides value, or null when it is not one. */
export function parseOverrides(raw: unknown): DefaultOverrides | null {
  const source = toObject(raw);
  if (!source) return null;
  const result: DefaultOverrides = {};
  for (const [namespace, keys] of Object.entries(source)) {
    if (!Array.isArray(keys)) continue;
    result[namespace] = [
      ...new Set(keys.filter((key): key is string => typeof key === "string")),
    ].sort();
  }
  return result;
}
