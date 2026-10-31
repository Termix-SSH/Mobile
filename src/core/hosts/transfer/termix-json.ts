// The Termix host file: what Plugin-Import-Export reads and writes, so a file
// from the web app imports here and the other way round.
import type { Credential, SSHHost } from "@/types";

export const KNOWN_AUTH_TYPES = [
  "password",
  "key",
  "credential",
  "none",
  "tailscale",
];

export interface ImportCredential {
  alias: string;
  name: string;
  description?: string;
  folder?: string;
  tags: string[];
  authType: "password" | "key";
  username?: string;
  keyType?: string;
}

/** One host row of the file, checked. */
export interface ImportRow {
  /** Number in the file's own id space, for jump hosts. */
  exportId?: number;
  connectionType: string;
  name?: string;
  ip: string;
  port: number;
  username: string;
  folder?: string;
  tags: string[];
  pin: boolean;
  notes?: string;
  color?: string;
  icon?: string;
  authType: string;
  password?: string;
  key?: string;
  keyPassword?: string;
  keyType?: string;
  credentialAlias?: string;
  overrideCredentialUsername: boolean;
  sudoPassword?: string;
  /** Ids in the file's id space. */
  jumpHosts: number[];
  /** Hosts named by alias, from an SSH config. */
  jumpAliases: string[];
  forceKeyboardInteractive?: boolean;
  sshOptions?: Record<string, unknown>;
  terminalConfig?: Record<string, unknown>;
  statusCheckEnabled?: boolean;
  statusCheckInterval?: number | null;
  pluginSettings: Record<string, Record<string, unknown>>;
  protocolAuth: Record<string, Record<string, unknown>>;
}

export interface ImportFile {
  rows: ImportRow[];
  credentials: ImportCredential[];
  /** Rows that were refused, with why. */
  errors: string[];
}

type Json = Record<string, any>;

const isObject = (value: unknown): value is Json =>
  !!value && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const rawText = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

function tagList(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return list
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);
}

export function isValidPort(value: unknown): value is number {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** Exports from before 2.9.0 carried the status check inside statsConfig. */
function statusCheck(
  raw: Json,
): Pick<ImportRow, "statusCheckEnabled" | "statusCheckInterval"> {
  const legacy = isObject(raw.statsConfig) ? raw.statsConfig : {};
  const enabled = raw.statusCheckEnabled ?? legacy.statusCheckEnabled;
  const interval = raw.statusCheckInterval ?? legacy.statusCheckInterval;
  const seconds = Number(interval);
  return {
    statusCheckEnabled:
      enabled === undefined && legacy.disableTcpPing !== true
        ? undefined
        : enabled !== false && legacy.disableTcpPing !== true,
    statusCheckInterval:
      interval != null && Number.isInteger(seconds) && seconds >= 5
        ? seconds
        : undefined,
  };
}

function jumpIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((jump) => Number(isObject(jump) ? jump.hostId : jump))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

/** Checks one raw row. Returns the row or why it can't be imported. */
export function normalizeRow(
  raw: unknown,
  position: number,
): ImportRow | string {
  const label = `Host ${position}`;
  if (!isObject(raw)) return `${label}: not a host`;
  const connectionType = text(raw.connectionType) ?? "ssh";
  const isSsh = connectionType === "ssh";
  const ip = text(raw.ip);
  if (!ip || !isValidPort(raw.port)) {
    return `${label}: Missing required fields (ip, port)`;
  }
  const authType = isSsh ? (text(raw.authType) ?? "password") : "password";
  if (isSsh && !KNOWN_AUTH_TYPES.includes(authType)) {
    return `${label}: Invalid authType. Must be one of ${KNOWN_AUTH_TYPES.join(", ")}`;
  }
  const username = text(raw.username);
  if (isSsh && username === undefined && authType !== "credential") {
    return `${label}: Username required for SSH connections`;
  }
  const password = rawText(raw.password);
  const key = rawText(raw.key);
  const alias = text(raw.credentialAlias);
  // A share file has no secrets, so a missing password or key is fine here.
  // The host asks for it when it connects.
  if (isSsh && authType === "credential" && !alias && !password && !key) {
    return `${label}: credentialAlias required for credential authentication`;
  }
  const exportId = Number(raw.exportId ?? raw.id);
  return {
    exportId:
      Number.isSafeInteger(exportId) && exportId > 0 ? exportId : undefined,
    connectionType,
    name: text(raw.name),
    ip,
    port: Number(raw.port),
    username: username ?? "",
    folder: text(raw.folder),
    tags: tagList(raw.tags),
    pin: raw.pin === true,
    notes: text(raw.notes),
    color: text(raw.color),
    icon: text(raw.icon),
    authType,
    password,
    key,
    keyPassword: rawText(raw.keyPassword),
    keyType: text(raw.keyType),
    credentialAlias: alias,
    overrideCredentialUsername: raw.overrideCredentialUsername === true,
    sudoPassword: rawText(raw.sudoPassword),
    jumpHosts: jumpIds(raw.jumpHosts),
    jumpAliases: [],
    forceKeyboardInteractive:
      raw.forceKeyboardInteractive === undefined
        ? undefined
        : raw.forceKeyboardInteractive === true,
    sshOptions: isObject(raw.sshOptions) ? raw.sshOptions : undefined,
    terminalConfig: isObject(raw.terminalConfig)
      ? raw.terminalConfig
      : undefined,
    ...statusCheck(raw),
    pluginSettings: isObject(raw.pluginSettings) ? raw.pluginSettings : {},
    protocolAuth: isObject(raw.protocolAuth) ? raw.protocolAuth : {},
  };
}

function normalizeCredential(raw: unknown): ImportCredential | null {
  if (!isObject(raw)) return null;
  const alias = text(raw.alias);
  const name = text(raw.name) ?? alias;
  if (!alias || !name) return null;
  return {
    alias,
    name,
    description: text(raw.description),
    folder: text(raw.folder),
    tags: tagList(raw.tags),
    authType: raw.authType === "key" ? "key" : "password",
    username: text(raw.username),
    keyType: text(raw.keyType),
  };
}

/** Reads the text of a Termix host file. Throws a plain message when it can't. */
export function parseImportFile(source: string): ImportFile {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error("That is not a valid JSON file");
  }
  const list = Array.isArray(data)
    ? data
    : isObject(data) && Array.isArray(data.hosts)
      ? data.hosts
      : null;
  if (!list || list.length === 0) {
    throw new Error("Hosts array is required and must not be empty");
  }
  const credentials =
    isObject(data) && Array.isArray(data.credentials)
      ? data.credentials
          .map(normalizeCredential)
          .filter((c): c is ImportCredential => !!c)
      : [];
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<number>();
  list.forEach((raw, i) => {
    const row = normalizeRow(raw, i + 1);
    if (typeof row === "string") {
      errors.push(row);
      return;
    }
    if (row.exportId !== undefined) {
      if (seen.has(row.exportId)) {
        errors.push(
          `Host ${i + 1}: duplicate exported host id ${row.exportId}`,
        );
        return;
      }
      seen.add(row.exportId);
    }
    rows.push(row);
  });
  return { rows, credentials, errors };
}

/**
 * Orders rows so a jump host comes before the hosts that use it. A jump host
 * that is not in the file, or a cycle, is an error for the row.
 */
export function orderByJumps(rows: ImportRow[]): {
  ordered: ImportRow[];
  errors: string[];
} {
  const byId = new Map<number, ImportRow>();
  for (const row of rows) if (row.exportId) byId.set(row.exportId, row);
  const byAlias = new Map<string, ImportRow>();
  for (const row of rows) if (row.name) byAlias.set(row.name, row);
  const ordered: ImportRow[] = [];
  const errors: string[] = [];
  const done = new Set<ImportRow>();
  const failed = new Set<ImportRow>();
  const visiting = new Set<ImportRow>();

  const visit = (row: ImportRow): boolean => {
    if (done.has(row)) return true;
    if (failed.has(row)) return false;
    const label = row.name || row.ip;
    if (visiting.has(row)) {
      errors.push(`${label}: jump host cycle`);
      failed.add(row);
      return false;
    }
    visiting.add(row);
    let ok = true;
    for (const id of row.jumpHosts) {
      const dependency = byId.get(id);
      if (!dependency) {
        errors.push(`${label}: jump host ${id} is not in the file`);
        ok = false;
      } else if (!visit(dependency)) ok = false;
    }
    for (const alias of row.jumpAliases) {
      const dependency = byAlias.get(alias);
      if (dependency && dependency !== row) visit(dependency);
    }
    visiting.delete(row);
    if (ok) {
      done.add(row);
      ordered.push(row);
    } else failed.add(row);
    return ok;
  };
  rows.forEach(visit);
  return { ordered, errors };
}

// Export

export interface ExportOptions {
  /** Leaves out every secret and points logins at a list by name. */
  share?: boolean;
}

export interface HostExport {
  version?: string;
  exportedAt?: string;
  credentials?: Json[];
  hosts: Json[];
}

const SECRET_KEY = /pass(word|phrase)?|secret|token|private|key$/i;

/** Drops secret looking values from a plugin settings object. */
export function scrubSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => scrubSecrets(item)) as T;
  if (!isObject(value)) return value;
  const out: Json = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key) && typeof item === "string") continue;
    out[key] = scrubSecrets(item);
  }
  return out as T;
}

/** The selected hosts plus every host they jump through. */
export function withJumpHosts(selected: SSHHost[], all: SSHHost[]): SSHHost[] {
  const byId = new Map(all.map((host) => [host.id, host]));
  const out = new Map(selected.map((host) => [host.id, host]));
  const queue = [...selected];
  while (queue.length) {
    const host = queue.pop()!;
    for (const jump of host.jumpHosts ?? []) {
      const next = byId.get(jump.hostId);
      if (next && !out.has(next.id)) {
        out.set(next.id, next);
        queue.push(next);
      }
    }
  }
  return [...out.values()];
}

function hostRow(
  host: SSHHost,
  credentials: Map<number, Credential>,
  share: boolean,
): Json {
  const isSsh = (host.connectionType ?? "ssh") === "ssh";
  const linked =
    host.authType === "credential" && host.credentialId
      ? credentials.get(host.credentialId)
      : undefined;
  let authType: string = host.authType;
  let username = host.username;
  let password = host.password;
  let key = host.key;
  let keyPassword = host.keyPassword;
  let keyType = host.keyType;
  if (linked && !share) {
    // A full export carries the login's secrets, like the web's.
    authType = linked.authType;
    if (!host.overrideCredentialUsername) username = linked.username;
    password = linked.password;
    key = linked.key;
    keyPassword = linked.keyPassword;
    keyType = linked.keyType;
  }
  const row: Json = {
    exportId: host.id,
    connectionType: host.connectionType ?? "ssh",
    name: host.name,
    ip: host.ip,
    port: host.port,
    username,
    password: share ? null : (password ?? null),
    folder: host.folder || null,
    tags: host.tags ?? [],
    pin: !!host.pin,
    notes: host.notes || null,
    color: host.color || null,
    icon: host.icon || null,
    pluginSettings: scrubSecrets(host.pluginSettings ?? {}),
    protocolAuth: share ? {} : (host.protocolAuth ?? {}),
  };
  if (!isSsh) return row;
  return {
    ...row,
    authType,
    key: share ? null : (key ?? null),
    keyPassword: share ? null : (keyPassword ?? null),
    keyType: keyType ?? null,
    credentialId: null,
    overrideCredentialUsername: !!host.overrideCredentialUsername,
    sudoPassword: share ? null : (host.sudoPassword ?? null),
    jumpHosts: host.jumpHosts?.length
      ? host.jumpHosts.map((jump) => ({ hostId: jump.hostId }))
      : null,
    terminalConfig: host.terminalConfig ?? null,
    sshOptions: host.sshOptions ?? {},
    forceKeyboardInteractive: !!host.forceKeyboardInteractive,
    statusCheckEnabled: host.statusCheckEnabled ?? true,
    statusCheckInterval: host.statusCheckInterval ?? null,
    ...(linked && share ? { credentialAlias: linked.name } : {}),
  };
}

/**
 * The file for a set of hosts. A share export has no secrets, and a host
 * that uses a saved login points at a scrubbed list of logins by name.
 */
export function buildExport(
  hosts: SSHHost[],
  credentials: Credential[],
  options: ExportOptions = {},
): HostExport {
  const share = options.share === true;
  const byId = new Map(credentials.map((c) => [c.id, c]));
  const rows = hosts.map((host) => hostRow(host, byId, share));
  if (!share) return { hosts: rows };
  const used = new Map<string, Json>();
  for (const host of hosts) {
    const login = host.credentialId ? byId.get(host.credentialId) : undefined;
    if (host.authType !== "credential" || !login || used.has(login.name)) {
      continue;
    }
    used.set(login.name, {
      alias: login.name,
      name: login.name,
      description: login.description ?? null,
      folder: login.folder ?? null,
      tags: login.tags ?? [],
      authType: login.authType,
      username: login.username || null,
      keyType: login.keyType ?? null,
    });
  }
  return {
    version: "1",
    exportedAt: new Date().toISOString(),
    credentials: [...used.values()],
    hosts: rows,
  };
}
