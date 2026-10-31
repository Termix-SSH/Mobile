// Maps the pre 2.9 server routes onto the 2.9 plugin routes. The rest of the
// app keeps calling the old paths and this decides where they really go.

import {
  pluginSettingsFromTerminalConfig,
  terminalConfigFromPluginSettings,
} from "./terminal-settings";

export type ApiGeneration = "legacy" | "plugin";

const PLUGIN_RULES: [RegExp, string][] = [
  [
    /^\/ssh\/file_manager\/ssh\/connect-warpgate(?=$|\?)/,
    "/plugin-api/file-manager/connect-browser-sign-in",
  ],
  [/^\/ssh\/file_manager\/ssh\//, "/plugin-api/file-manager/"],
  [/^\/ssh\/file_manager\//, "/plugin-api/file-manager/"],
  [/^\/host\/file_manager\//, "/plugin-api/file-manager/"],
  [/^\/ssh\/tunnel\//, "/plugin-api/tunnels/"],
  [/^\/status(?=$|\/|\?)/, "/host/status"],
  [/^\/refresh(?=$|\?)/, "/host/status/refresh"],
  [/^\/metrics\//, "/plugin-api/host-metrics/metrics/"],
  [
    /^\/docker\/ssh\/connect-warpgate(?=$|\?)/,
    "/plugin-api/docker/ssh/connect-browser-sign-in",
  ],
  [/^\/docker\//, "/plugin-api/docker/"],
  [/^\/snippets(?=$|\/|\?)/, "/plugin-api/snippets"],
  [/^\/terminal\/command_history/, "/plugin-api/ssh-terminal/command-history"],
  [/^\/guacamole\/connect-host\//, "/plugin-api/remote-desktop/connect-host/"],
  [/^\/host\/db\/host\/(\d+)\/wake/, "/plugin-api/wake-on-lan/host/$1/wake"],
  [/^\/users\/oidc-config(?=$|\?)/, "/plugin-api/sso/config"],
  [/^\/uptime(?=$|\?)/, "/dashboard/uptime"],
  [/^\/activity\//, "/dashboard/activity/"],
  [
    /^\/users\/totp\/(setup|enable|disable|backup-codes)(?=$|\?)/,
    "/plugin-api/totp/$1",
  ],
];

/** Rewrites a path (relative to the server root) for the 2.9 plugin API. */
export function toPluginPath(path: string): string {
  for (const [pattern, replacement] of PLUGIN_RULES) {
    if (pattern.test(path)) return path.replace(pattern, replacement);
  }
  return path;
}

/** Same as toPluginPath but takes the HTTP method into account. */
export function toPluginRequest(method: string, path: string): string {
  const upper = method.toUpperCase();
  // 2.9 moved container removal under /remove and needs force for running ones.
  const dockerRemove = /^\/docker\/containers\/([^/]+)\/([^/?]+)$/;
  if (upper === "DELETE" && dockerRemove.test(path)) {
    return path.replace(
      dockerRemove,
      "/plugin-api/docker/containers/$1/$2/remove?force=true",
    );
  }
  return toPluginPath(path);
}

export function isVersionAtLeast(version: unknown, target: string): boolean {
  if (typeof version !== "string") return false;
  const parse = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(/[.-]/)
      .slice(0, 3)
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(version);
  const b = parse(target);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

function parseMaybeJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value as T) ?? fallback;
}

type Settings = Record<string, Record<string, unknown> | undefined>;

/**
 * Fills the pre 2.9 flat host fields from 2.9 pluginSettings so the UI can
 * keep reading host.enableDocker and friends. Never overrides a value the
 * server already put on the host. A plugin missing from pluginSettings is off
 * on the server, so its features read as disabled.
 */
export function flattenPluginSettings<T extends Record<string, any>>(
  input: T,
): T {
  // 2.9 sends statsConfig as an object, the UI parses a JSON string.
  const host: Record<string, any> =
    input?.statsConfig && typeof input.statsConfig === "object"
      ? { ...input, statsConfig: JSON.stringify(input.statsConfig) }
      : input;
  const settings = host?.pluginSettings as Settings | undefined;
  if (!settings || typeof settings !== "object") return host as T;

  const out: Record<string, any> = { ...host };
  const set = (key: string, value: unknown) => {
    if (out[key] === undefined || out[key] === null) out[key] = value;
  };

  const terminal = settings["ssh-terminal"];
  set("enableTerminal", terminal ? terminal.enableTerminal !== false : false);
  if (terminal?.connectFrom) set("connectFrom", terminal.connectFrom);
  const terminalConfig = terminalConfigFromPluginSettings(
    terminal,
    settings.snippets,
  );
  if (Object.keys(terminalConfig).length > 0) {
    set("terminalConfig", terminalConfig);
  }

  const files = settings["file-manager"];
  set("enableFileManager", files ? files.enableFileManager !== false : false);
  set("defaultPath", (files?.defaultPath as string) || "/");
  set("showFilesPanel", files ? files.showPanel !== false : true);

  const docker = settings.docker;
  set("enableDocker", Boolean(docker?.enableDocker));
  set("enableServices", Boolean(settings["service-manager"]?.enableServices));

  const tunnels = settings.tunnels;
  set("enableTunnel", Boolean(tunnels?.enableTunnel));
  set(
    "tunnelConnections",
    tunnels ? parseMaybeJson(tunnels.tunnelConnections, []) : [],
  );

  const rd = settings["remote-desktop"];
  set("enableRdp", Boolean(rd?.enableRdp));
  set("enableVnc", Boolean(rd?.enableVnc));
  set("enableTelnet", Boolean(rd?.enableTelnet));
  if (rd) {
    set("rdpPort", rd.rdpPort ?? 3389);
    set("vncPort", rd.vncPort ?? 5900);
    set("telnetPort", rd.telnetPort ?? 23);
    if (typeof rd.rdpSecurity === "string") set("rdpSecurity", rd.rdpSecurity);
    if (rd.guacamoleConfig !== undefined) {
      set("guacamoleConfig", rd.guacamoleConfig);
    }
  }

  const metrics = settings["host-metrics"];
  if (metrics) {
    set(
      "statsConfig",
      JSON.stringify({
        enabledWidgets: parseMaybeJson(metrics.enabledWidgets, undefined),
        metricsEnabled: metrics.metricsEnabled !== false,
        metricsInterval: metrics.metricsInterval,
        statusCheckEnabled: host.statusCheckEnabled,
        statusCheckInterval: host.statusCheckInterval,
      }),
    );
  } else {
    // Stats are off server side; the action sheet reads metricsEnabled.
    set("statsConfig", JSON.stringify({ metricsEnabled: false }));
  }

  const wol = settings["wake-on-lan"];
  if (wol) set("macAddress", wol.macAddress || null);

  return out as T;
}

/** The per plugin host settings a host form save writes on 2.9. */
export function buildPluginHostSettings(
  data: Record<string, any>,
  options: { savedTunnels?: boolean } = {},
): Record<string, Record<string, unknown>> {
  const tunnelConnections = data.enableTunnel
    ? data.tunnelConnections || []
    : [];
  const terminal = pluginSettingsFromTerminalConfig(data.terminalConfig);
  const out: Record<string, Record<string, unknown>> = {
    "ssh-terminal": {
      ...terminal.terminal,
      enableTerminal: data.enableTerminal !== false,
    },
    "file-manager": {
      enableFileManager: Boolean(data.enableFileManager),
      defaultPath: data.enableFileManager ? data.defaultPath || "/" : "/",
    },
    docker: { enableDocker: Boolean(data.enableDocker) },
    "service-manager": { enableServices: Boolean(data.enableServices) },
    // With saved routes the list goes to PUT /saved and the plugin mirrors it.
    tunnels: options.savedTunnels
      ? { enableTunnel: Boolean(data.enableTunnel) }
      : { enableTunnel: Boolean(data.enableTunnel), tunnelConnections },
    "remote-desktop": {
      enableRdp: Boolean(data.enableRdp),
      rdpPort: Number(data.rdpPort) || 3389,
      enableVnc: Boolean(data.enableVnc),
      vncPort: Number(data.vncPort) || 5900,
      enableTelnet: Boolean(data.enableTelnet),
      telnetPort: Number(data.telnetPort) || 23,
    },
    "wake-on-lan": { macAddress: data.macAddress?.trim() || "" },
  };
  // Only set when the form picked one, so other saves keep the saved profile.
  if (data.vaultProfileId !== undefined) {
    out.vault = { profileId: data.vaultProfileId };
  }
  if (Object.keys(terminal.snippets).length > 0) {
    out.snippets = terminal.snippets;
  }
  const patch = data.pluginSettingsPatch as
    Record<string, Record<string, unknown>> | undefined;
  for (const [pluginId, values] of Object.entries(patch ?? {})) {
    out[pluginId] = { ...out[pluginId], ...values };
  }
  return out;
}

/** ws(s):// form of the server root, without a trailing slash or /ssh. */
export function toWebSocketBase(serverUrl: string): string {
  const root = serverUrl.replace(/\/+$/, "").replace(/\/ssh$/, "");
  return root.replace(/^http/i, (scheme) =>
    scheme.toLowerCase() === "https" ? "wss" : "ws",
  );
}

/**
 * Terminal socket URL. 2.9 only reads the token from the subprotocol, older
 * servers also want it in the query.
 */
export function buildTerminalWebSocketUrl(
  serverUrl: string,
  token: string,
  generation: ApiGeneration,
): string {
  const base = toWebSocketBase(serverUrl);
  if (generation === "plugin") return `${base}/plugin-ws/ssh-terminal/terminal`;
  return `${base}/ssh/websocket/?token=${encodeURIComponent(token)}`;
}

/** 2.9 tunnel names, see plugins/tunnels/src/shared/tunnel-naming.ts. */
export function pluginTunnelName(
  host: {
    id: number | string;
    name?: string | null;
    username?: string | null;
    ip: string;
  },
  index: number,
  tunnel: {
    sourcePort: number | string;
    endpointHost?: string | null;
    endpointPort?: number | string | null;
  },
): string {
  const label = host.name || `${host.username ?? ""}@${host.ip}`;
  return `${host.id}::${index}::${label}::${tunnel.sourcePort}::${(tunnel.endpointHost ?? "").trim()}::${tunnel.endpointPort ?? 0}`;
}

/** First Tunnels plugin version with the saved routes. */
export const SAVED_TUNNELS_SINCE = "1.2.0";

/**
 * Whether the Tunnels plugin keeps its own saved list (1.2.0+). An unknown
 * version counts as yes: a 404 on the first call drops back to host settings.
 */
export function hasSavedTunnels(
  plugin: { version?: string } | undefined,
): boolean {
  if (!plugin) return false;
  if (!plugin.version) return true;
  return isVersionAtLeast(plugin.version, SAVED_TUNNELS_SINCE);
}

const STRIP_FROM_SAVED = [
  "endpointPassword",
  "endpointKey",
  "endpointKeyPassword",
  "endpointAuthType",
  "endpointKeyType",
  "sourceHostId",
  "sourceHostName",
];

/** A tunnel as PUT /saved takes it: the plugin's fields only, always s2s. */
export function toSavedTunnel<T extends Record<string, any>>(tunnel: T): T {
  const out: Record<string, any> = { ...tunnel };
  for (const key of STRIP_FROM_SAVED) delete out[key];
  if (out.scope === "c2s") delete out.scope;
  return out as T;
}
