import {
  buildPluginHostSettings,
  flattenPluginSettings,
} from "@/core/api/compat/api-compat";
import type {
  CredentialRow,
  HostRow,
  NewCredentialRow,
  NewHostRow,
  SnippetFolderRow,
  SnippetRow,
} from "@/core/db/schema";
import type {
  Credential,
  SharedInfo,
  SnippetFolder,
  SSHHost,
  SSHHostData,
  Snippet,
} from "@/types";

type Json = Record<string, any>;

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return (JSON.parse(value) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

/** The server's shared marker on a synced copy: who shared it and how. */
export function sharedOf(source: string | null): SharedInfo | null {
  if (!source) return null;
  const shared = parseJson<Json>(source, {});
  return {
    owner: typeof shared.owner === "string" ? shared.owner : "",
    permissionLevel:
      typeof shared.permissionLevel === "string"
        ? shared.permissionLevel
        : "view",
  };
}

const json = (value: unknown) =>
  value === undefined || value === null ? null : JSON.stringify(value);

/** Same as the server: tags are one comma separated column. */
export const joinTags = (tags: string[] | string | undefined | null) =>
  Array.isArray(tags) ? tags.join(",") : (tags ?? "");

export const splitTags = (tags: string | null) =>
  (tags ?? "").split(",").filter(Boolean);

const orNull = <T>(value: T | undefined | null | ""): T | null =>
  value === undefined || value === "" ? null : value;

/** Protocols whose logins live in protocolAuth, like a 2.9 server. */
const PROTOCOL_LOGINS = {
  rdp: { user: "rdpUser", password: "rdpPassword", domain: "rdpDomain" },
  vnc: { user: "vncUser", password: "vncPassword" },
  telnet: { user: "telnetUser", password: "telnetPassword" },
} as const;

export function hostFromRow(row: HostRow): SSHHost {
  const pluginSettings = parseJson<Json>(row.pluginSettings, {});
  const protocolAuth = parseJson<Json>(row.protocolAuth, {});
  const host: Json = {
    id: row.id,
    syncId: row.syncId,
    serverId: row.serverId ?? null,
    shared: sharedOf(row.sharedSource),
    connectionType: row.connectionType,
    name: row.name ?? "",
    ip: row.ip,
    port: row.port,
    username: row.username,
    folder: row.folder ?? "",
    parentHostId: row.parentHostId ?? null,
    tags: splitTags(row.tags),
    pin: row.pin,
    sortOrder: row.sortOrder ?? null,
    authType: row.authType,
    password: row.password ?? undefined,
    key: row.key ?? undefined,
    keyPassword: row.keyPassword ?? undefined,
    keyType: row.keyType ?? undefined,
    sudoPassword: row.sudoPassword ?? undefined,
    forceKeyboardInteractive: row.forceKeyboardInteractive === "true",
    credentialId: row.credentialId ?? undefined,
    overrideCredentialUsername: row.overrideCredentialUsername ?? false,
    jumpHosts: parseJson<{ hostId: unknown }[]>(row.jumpHosts, [])
      .map((item) => ({ hostId: Number(item?.hostId) }))
      .filter((item) => Number.isFinite(item.hostId)),
    notes: row.notes ?? "",
    color: row.color ?? null,
    icon: row.icon ?? null,
    enableSsh: row.enableSsh,
    sshPort: row.sshPort ?? row.port,
    statusCheckEnabled: row.statusCheckEnabled,
    statusCheckInterval: row.statusCheckInterval,
    sshOptions: parseJson<Json>(row.sshOptions, {}),
    pluginSettings,
    protocolAuth,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  for (const [protocol, fields] of Object.entries(PROTOCOL_LOGINS)) {
    const login = protocolAuth[protocol];
    if (!login) continue;
    host[fields.user] = login.username ?? undefined;
    host[fields.password] = login.password ?? undefined;
    if ("domain" in fields) host[fields.domain] = login.fields?.domain;
  }
  return flattenPluginSettings(host) as SSHHost;
}

/**
 * The row for a host form save. `current` is the stored row on update: a
 * secret left undefined keeps its stored value, and secrets of another auth
 * type are cleared, like the server does.
 */
export function hostToRow(
  data: SSHHostData,
  current: HostRow | null,
): Omit<NewHostRow, "syncId"> {
  const auth = data.authType;
  const keep = <K extends keyof HostRow>(
    field: K,
    value: unknown,
    active: boolean,
  ) => {
    if (!active) return null;
    if (value === undefined) return current?.[field] ?? null;
    return typeof value === "string" ? orNull(value) : null;
  };

  // Merged per plugin, so keys the form doesn't edit (like connectFrom) stay.
  const pluginSettings = parseJson<Json>(current?.pluginSettings, {});
  for (const [id, values] of Object.entries(buildPluginHostSettings(data))) {
    pluginSettings[id] = { ...(pluginSettings[id] ?? {}), ...values };
  }
  const stats = parseJson<Json>(
    typeof data.statsConfig === "string"
      ? data.statsConfig
      : json(data.statsConfig),
    {},
  );
  if (Object.keys(stats).length > 0) {
    pluginSettings["host-metrics"] = {
      ...(pluginSettings["host-metrics"] ?? {}),
      enabledWidgets: stats.enabledWidgets,
      metricsEnabled: stats.metricsEnabled !== false,
      metricsInterval: stats.metricsInterval,
    };
  }

  const protocolAuth = parseJson<Json>(current?.protocolAuth, {});
  const enabled: Record<keyof typeof PROTOCOL_LOGINS, boolean | undefined> = {
    rdp: data.enableRdp,
    vnc: data.enableVnc,
    telnet: data.enableTelnet,
  };
  for (const [protocol, fields] of Object.entries(PROTOCOL_LOGINS)) {
    const on = enabled[protocol as keyof typeof PROTOCOL_LOGINS];
    if (!on) {
      delete protocolAuth[protocol];
      continue;
    }
    const prev = protocolAuth[protocol] ?? {};
    const input = data as Json;
    const password = input[fields.password];
    protocolAuth[protocol] = {
      ...prev,
      authType: "direct",
      username: orNull(input[fields.user]) ?? null,
      password:
        password === undefined ? (prev.password ?? null) : orNull(password),
      fields:
        "domain" in fields
          ? { ...(prev.fields ?? {}), domain: orNull(input[fields.domain]) }
          : (prev.fields ?? {}),
      credentialId: prev.credentialId ?? null,
    };
  }

  const anyProtocol =
    data.enableSsh !== undefined ||
    data.enableRdp ||
    data.enableVnc ||
    data.enableTelnet;
  const port = Number(data.port) || 22;
  // A host sits in a folder or under a parent host, never both. A new
  // folder replaces the parent, like the server.
  const parentHostId =
    data.parentHostId !== undefined
      ? data.parentHostId
      : data.folder?.trim()
        ? null
        : (current?.parentHostId ?? null);
  return {
    connectionType: current?.connectionType ?? "ssh",
    name: data.name || "",
    ip: data.ip,
    port,
    username: data.username ?? "",
    folder: parentHostId ? null : data.folder || "",
    parentHostId,
    tags: joinTags(data.tags),
    pin: Boolean(data.pin),
    authType: auth,
    password: keep("password", data.password, auth === "password"),
    key: keep(
      "key",
      typeof data.key === "string" ? data.key : undefined,
      auth === "key",
    ),
    keyPassword: keep("keyPassword", data.keyPassword, auth === "key"),
    keyType: auth === "key" ? orNull(data.keyType) : null,
    sudoPassword: keep("sudoPassword", data.sudoPassword, true),
    credentialId: auth === "credential" ? (data.credentialId ?? null) : null,
    overrideCredentialUsername: Boolean(data.overrideCredentialUsername),
    forceKeyboardInteractive: data.forceKeyboardInteractive ? "true" : "false",
    jumpHosts: json(data.jumpHosts ?? []),
    notes: data.notes ?? "",
    color:
      data.color !== undefined ? orNull(data.color) : (current?.color ?? null),
    icon: data.icon !== undefined ? orNull(data.icon) : (current?.icon ?? null),
    enableSsh: anyProtocol ? Boolean(data.enableSsh) : true,
    sshPort: port,
    statusCheckEnabled:
      stats.statusCheckEnabled ?? current?.statusCheckEnabled ?? true,
    statusCheckInterval:
      stats.statusCheckInterval ?? current?.statusCheckInterval ?? null,
    sshOptions:
      data.sshOptions !== undefined
        ? json(data.sshOptions)
        : (current?.sshOptions ?? null),
    pluginSettings: json(pluginSettings),
    protocolAuth: json(protocolAuth),
  };
}

export function credentialFromRow(row: CredentialRow): Credential {
  return {
    id: row.id,
    shared: sharedOf(row.sharedSource),
    name: row.name,
    description: row.description ?? undefined,
    folder: row.folder ?? undefined,
    tags: splitTags(row.tags),
    authType: row.authType as Credential["authType"],
    username: row.username ?? "",
    password: row.password ?? undefined,
    key: row.key ?? row.privateKey ?? undefined,
    publicKey: row.publicKey ?? undefined,
    keyPassword: row.keyPassword ?? undefined,
    keyType: row.keyType ?? undefined,
    usageCount: row.usageCount,
    lastUsed: row.lastUsed ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    certPublicKey: row.certPublicKey ?? undefined,
    ...({ syncId: row.syncId } as object),
  };
}

/** Like the server's update: a secret not sent keeps its stored value. */
export function credentialToRow(
  data: Partial<Credential>,
  current: CredentialRow | null,
): Omit<NewCredentialRow, "syncId"> {
  const authType = data.authType ?? current?.authType ?? "password";
  const pick = <K extends keyof CredentialRow>(
    field: K,
    value: string | undefined,
    active: boolean,
  ) => {
    if (!active) return null;
    if (value === undefined) return (current?.[field] as string) ?? null;
    return orNull(value);
  };
  const key = pick("key", data.key, authType === "key");
  return {
    name: (data.name ?? current?.name ?? "").trim(),
    description: orNull(data.description?.trim()) ?? null,
    folder: orNull(data.folder?.trim()) ?? null,
    tags: joinTags(data.tags ?? splitTags(current?.tags ?? null)),
    authType,
    username: orNull(data.username?.trim()) ?? null,
    password: pick("password", data.password, authType === "password"),
    key,
    privateKey: key,
    publicKey: pick("publicKey", data.publicKey, authType === "key"),
    keyPassword: pick("keyPassword", data.keyPassword, authType === "key"),
    keyType: authType === "key" ? orNull(data.keyType) : null,
    certPublicKey: pick(
      "certPublicKey",
      data.certPublicKey?.trim(),
      authType === "key",
    ),
  };
}

export function snippetFromRow(row: SnippetRow): Snippet {
  return {
    id: row.id,
    syncId: row.syncId,
    userId: "",
    name: row.name,
    content: row.content,
    description: row.description ?? undefined,
    // Null like the server: screens group by `folder === null`.
    folder: row.folder as string | undefined,
    order: row.order,
    isNote: row.isNote,
    hostFilter: row.hostFilter,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function snippetFolderFromRow(row: SnippetFolderRow): SnippetFolder {
  return {
    id: row.id,
    userId: "",
    name: row.name,
    color: row.color ?? undefined,
    icon: row.icon ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as SnippetFolder;
}
