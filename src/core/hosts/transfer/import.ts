// Turns a checked import file into hosts and logins through the repositories.
import type { DataRepositories } from "@/core/data/types";
import type { AuthType, SSHHost, SSHHostData } from "@/types";
import { parseHop, parseSshConfig } from "./ssh-config";
import {
  orderByJumps,
  isValidPort,
  type ImportCredential,
  type ImportFile,
  type ImportRow,
} from "./termix-json";

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface ImportOptions {
  /** Update a host with the same address, port and username instead of skipping it. */
  overwrite?: boolean;
}

const PLACEHOLDER_NOTE =
  "Imported placeholder. Add the secret before connecting.";

export const hostKey = (host: { ip: string; port: number; username: string }) =>
  `${host.ip}:${host.port}:${host.username}`;

export function importSummary(result: ImportResult): string {
  return `${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`;
}

/** The rows an SSH config makes. ProxyJump hops become jump aliases. */
export function rowsFromSshConfig(content: string): ImportFile {
  const hosts = parseSshConfig(content);
  if (hosts.length === 0) {
    throw new Error("No valid Host entries found in the SSH config file");
  }
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const known = new Set(hosts.map((host) => host.name));
  let next = 1;
  const ids = new Map<string, number>();
  for (const host of hosts) ids.set(host.name, next++);
  for (const host of hosts) {
    const port = host.port ?? 22;
    if (!isValidPort(port)) {
      errors.push(`Host "${host.name}": bad port`);
      continue;
    }
    const hops = host.proxyJump.map(parseHop);
    rows.push({
      exportId: ids.get(host.name),
      connectionType: "ssh",
      name: host.name,
      ip: host.hostname,
      port,
      username: host.user ?? "",
      tags: [],
      pin: false,
      // The phone can't read a key file path, so the login is asked for.
      authType: "none",
      notes: host.identityFile
        ? `Identity file: ${host.identityFile}`
        : undefined,
      overrideCredentialUsername: false,
      jumpHosts: hops
        .map((hop) => (known.has(hop.host) ? ids.get(hop.host)! : 0))
        .filter(Boolean),
      jumpAliases: [],
      pluginSettings: {},
      protocolAuth: {},
    });
    const jumpsOutside = hops.filter((hop) => !known.has(hop.host));
    if (jumpsOutside.length) {
      errors.push(
        `Host "${host.name}": jump ${jumpsOutside.map((h) => h.host).join(", ")} is not in the file, so it was left out`,
      );
    }
  }
  return { rows, credentials: [], errors };
}

type Json = Record<string, any>;

/** The host form payload for one row. */
export function rowToDraft(
  row: ImportRow,
  credentialId: number | undefined,
  jumpIds: number[],
): SSHHostData {
  const ps = row.pluginSettings;
  const get = (plugin: string, key: string): any => (ps[plugin] as Json)?.[key];
  const isSsh = row.connectionType === "ssh";
  const proto = (row.protocolAuth[row.connectionType] ?? {}) as Json;
  const draft: SSHHostData = {
    name: row.name || `${row.username || "host"}@${row.ip}`,
    ip: row.ip,
    port: row.port,
    username: isSsh ? row.username : "",
    folder: row.folder ?? "",
    tags: row.tags,
    pin: row.pin,
    authType: row.authType as AuthType,
    password: row.authType === "password" ? row.password : undefined,
    key: row.authType === "key" ? (row.key as never) : undefined,
    keyPassword: row.authType === "key" ? row.keyPassword : undefined,
    keyType: row.authType === "key" ? (row.keyType ?? "auto") : undefined,
    credentialId: row.authType === "credential" ? credentialId : undefined,
    overrideCredentialUsername: row.overrideCredentialUsername,
    sudoPassword: row.sudoPassword,
    notes: row.notes ?? "",
    color: row.color ?? null,
    icon: row.icon ?? null,
    jumpHosts: jumpIds.map((hostId) => ({ hostId })),
    forceKeyboardInteractive: row.forceKeyboardInteractive,
    sshOptions: row.sshOptions,
    terminalConfig: row.terminalConfig as never,
    enableSsh: isSsh,
    enableTerminal: get("ssh-terminal", "enableTerminal") !== false,
    enableFileManager: get("file-manager", "enableFileManager") !== false,
    defaultPath: get("file-manager", "defaultPath") || "/",
    enableDocker: get("docker", "enableDocker") === true,
    enableServices: get("service-manager", "enableServices") === true,
    enableTunnel: get("tunnels", "enableTunnel") === true,
    tunnelConnections: Array.isArray(get("tunnels", "tunnelConnections"))
      ? get("tunnels", "tunnelConnections")
      : [],
    macAddress: get("wake-on-lan", "macAddress") || undefined,
  };
  if (row.statusCheckEnabled !== undefined || row.statusCheckInterval) {
    draft.statsConfig = JSON.stringify({
      statusCheckEnabled: row.statusCheckEnabled,
      statusCheckInterval: row.statusCheckInterval,
    });
  }
  if (!isSsh) {
    const user = typeof proto.username === "string" ? proto.username : "";
    const pass = typeof proto.password === "string" ? proto.password : "";
    if (row.connectionType === "rdp") {
      draft.enableRdp = true;
      draft.rdpPort = row.port;
      draft.rdpUser = user;
      draft.rdpPassword = pass;
      draft.rdpDomain = (proto.fields as Json | undefined)?.domain ?? "";
    } else if (row.connectionType === "vnc") {
      draft.enableVnc = true;
      draft.vncPort = row.port;
      draft.vncUser = user;
      draft.vncPassword = pass;
    } else if (row.connectionType === "telnet") {
      draft.enableTelnet = true;
      draft.telnetPort = row.port;
      draft.telnetUser = user;
      draft.telnetPassword = pass;
    }
  }
  return draft;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Creates the placeholder logins a share file names, and maps alias to id. */
async function ensureCredentials(
  repos: DataRepositories,
  wanted: ImportCredential[],
  errors: string[],
): Promise<Map<string, number>> {
  const aliases = new Map<string, number>();
  const existing = await repos.credentials.list();
  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));
  for (const c of existing) aliases.set(c.name.toLowerCase(), c.id);
  for (const wantedCredential of wanted) {
    const found = byName.get(wantedCredential.name.toLowerCase());
    if (found) {
      aliases.set(wantedCredential.alias.toLowerCase(), found);
      continue;
    }
    try {
      const made = await repos.credentials.create({
        name: wantedCredential.name,
        description: wantedCredential.description ?? PLACEHOLDER_NOTE,
        folder: wantedCredential.folder,
        tags: wantedCredential.tags,
        authType: wantedCredential.authType,
        username: wantedCredential.username ?? "",
        keyType: wantedCredential.keyType,
      });
      byName.set(made.name.toLowerCase(), made.id);
      aliases.set(wantedCredential.alias.toLowerCase(), made.id);
      aliases.set(wantedCredential.name.toLowerCase(), made.id);
    } catch (error) {
      errors.push(`Credential ${wantedCredential.name}: ${message(error)}`);
    }
  }
  return aliases;
}

/** Writes the file's hosts. Hosts that jump through others come after them. */
export async function importHosts(
  repos: DataRepositories,
  file: ImportFile,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [...file.errors],
  };
  result.failed += file.errors.length;
  const { ordered, errors: orderErrors } = orderByJumps(file.rows);
  result.errors.push(...orderErrors);
  result.failed += orderErrors.length;

  const aliases = await ensureCredentials(
    repos,
    file.credentials,
    result.errors,
  );
  const stored = (await repos.hosts.list()).filter((host) => !host.shared);
  const existing = new Map<string, SSHHost>(
    stored.map((host) => [hostKey(host), host]),
  );
  const byName = new Map(stored.map((host) => [host.name, host.id]));
  const idMap = new Map<number, number>();

  for (const row of ordered) {
    const label = row.name || row.ip;
    try {
      const match = existing.get(hostKey(row));
      if (match && !options.overwrite) {
        if (row.exportId) idMap.set(row.exportId, match.id);
        byName.set(label, match.id);
        result.skipped++;
        continue;
      }
      let credentialId: number | undefined;
      let usedRow = row;
      if (row.authType === "credential") {
        credentialId = row.credentialAlias
          ? aliases.get(row.credentialAlias.toLowerCase())
          : undefined;
        if (!credentialId) {
          if (row.key) usedRow = { ...row, authType: "key" };
          else if (row.password) usedRow = { ...row, authType: "password" };
          else {
            result.failed++;
            result.errors.push(
              `${label}: credential ${row.credentialAlias ?? ""} was not found`,
            );
            continue;
          }
        }
      }
      const jumps = [
        ...row.jumpHosts.map((id) => idMap.get(id)),
        ...row.jumpAliases.map((alias) => byName.get(alias)),
      ].filter((id): id is number => typeof id === "number");
      const draft = rowToDraft(usedRow, credentialId, jumps);
      const saved = match
        ? await repos.hosts.update(match.id, draft)
        : await repos.hosts.create(draft);
      if (match) result.updated++;
      else result.created++;
      if (row.exportId) idMap.set(row.exportId, saved.id);
      byName.set(label, saved.id);
      existing.set(hostKey(saved), saved);
    } catch (error) {
      result.failed++;
      result.errors.push(`${label}: ${message(error)}`);
    }
  }
  return result;
}
