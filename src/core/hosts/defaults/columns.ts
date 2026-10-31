// Core defaults in column form, like core's core-columns.ts. A host row is
// read into a default's value and written back from one.
import {
  CORE_KEYS,
  normalizeAuthDefault,
  normalizeSocks5Default,
  toBoolean,
  toObject,
} from "./values";

export type Columns = Record<string, unknown>;

const SSH_OPTION_KEYS = [
  "keepaliveInterval",
  "keepaliveCountMax",
  "allowLegacyAlgorithms",
  "agentForwarding",
  "environmentVariables",
];

const isSshOption = (key: string) => SSH_OPTION_KEYS.includes(key);

const entryOf = (key: string) => CORE_KEYS.find((entry) => entry.key === key);

function sshOptionsOf(row: Columns): Record<string, unknown> {
  return toObject(row.sshOptions) ?? {};
}

function parseList(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/** The value a core key has on a row, normalized. */
export function readCoreDefault(key: string, row: Columns): unknown {
  const entry = entryOf(key);
  if (!entry) return undefined;
  const options = sshOptionsOf(row);
  switch (key) {
    case "username":
      return entry.normalize(row.username);
    case "sshPort":
      return entry.normalize(row.sshPort ?? row.port);
    case "auth":
      return normalizeAuthDefault({
        authType: row.authType,
        credentialId: row.credentialId,
        overrideCredentialUsername: toBoolean(
          row.overrideCredentialUsername,
          false,
        ),
        agentSocketPath: options.agentSocketPath,
        agentIdentity: options.agentIdentity,
      });
    case "forceKeyboardInteractive":
      return entry.normalize(row.forceKeyboardInteractive);
    case "socks5":
      return normalizeSocks5Default({
        useSocks5: toBoolean(row.useSocks5, false),
        socks5Host: row.socks5Host,
        socks5Port: row.socks5Port,
        socks5Username: row.socks5Username,
        socks5ProxyChain: parseList(row.socks5ProxyChain),
      });
    case "jumpHosts":
    case "portKnockSequence":
      return entry.normalize(parseList(row[key]));
    case "statusCheckEnabled":
    case "statusCheckInterval":
      return entry.normalize(row[key]);
    default:
      return isSshOption(key) ? entry.normalize(options[key]) : undefined;
  }
}

/** The column patch that gives a row this value. */
export function writeCoreDefault(
  key: string,
  value: unknown,
  row: Columns,
): Columns {
  const entry = entryOf(key);
  if (!entry) return {};
  const normalized = entry.normalize(value);

  if (key === "auth") {
    const auth = normalizeAuthDefault(value);
    if (!auth) return {};
    const next = { ...sshOptionsOf(row) };
    if (auth.authType === "agent") {
      next.agentSocketPath = auth.agentSocketPath;
      next.agentIdentity = auth.agentIdentity;
    } else {
      delete next.agentSocketPath;
      delete next.agentIdentity;
    }
    return {
      authType: auth.authType,
      credentialId: auth.credentialId,
      overrideCredentialUsername: auth.overrideCredentialUsername,
      sshOptions: JSON.stringify(next),
      // A credential host may keep its own password next to the credential.
      ...(auth.authType === "credential" ? {} : { password: null }),
      key: null,
      keyPassword: null,
      keyType: null,
    };
  }
  if (isSshOption(key)) {
    return {
      sshOptions: JSON.stringify({ ...sshOptionsOf(row), [key]: normalized }),
    };
  }

  switch (key) {
    case "username":
      return normalized === null ? {} : { username: normalized };
    case "sshPort": {
      const patch: Columns = { sshPort: normalized };
      if ((row.connectionType ?? "ssh") === "ssh") patch.port = normalized;
      return patch;
    }
    case "forceKeyboardInteractive":
      return { forceKeyboardInteractive: normalized ? "true" : "false" };
    case "socks5": {
      const socks = normalizeSocks5Default(value);
      return {
        useSocks5: socks.useSocks5,
        socks5Host: socks.socks5Host,
        socks5Port: socks.socks5Port,
        socks5Username: socks.socks5Username,
        socks5ProxyChain: socks.socks5ProxyChain
          ? JSON.stringify(socks.socks5ProxyChain)
          : null,
      };
    }
    case "jumpHosts":
    case "portKnockSequence":
      return {
        [key]:
          Array.isArray(normalized) && normalized.length > 0
            ? JSON.stringify(normalized)
            : null,
      };
    case "statusCheckEnabled":
      return { statusCheckEnabled: !!normalized };
    case "statusCheckInterval":
      return { statusCheckInterval: normalized };
    default:
      return {};
  }
}
