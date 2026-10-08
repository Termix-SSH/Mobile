export type ServerFeature =
  | "terminal"
  | "commandHistory"
  | "fileManager"
  | "tunnels"
  | "metrics"
  | "docker"
  | "rdp"
  | "vnc"
  | "telnet"
  | "snippets"
  | "wakeOnLan"
  | "alerts"
  | "totp";

export interface ServerPlugin {
  id: string;
  protocols?: string[];
}

const FEATURE_PLUGINS: Record<ServerFeature, string> = {
  terminal: "ssh-terminal",
  commandHistory: "ssh-terminal",
  fileManager: "file-manager",
  tunnels: "tunnels",
  metrics: "host-metrics",
  docker: "docker",
  rdp: "remote-desktop",
  vnc: "remote-desktop",
  telnet: "remote-desktop",
  snippets: "snippets",
  wakeOnLan: "wake-on-lan",
  alerts: "alerts",
  totp: "totp",
};

const PROTOCOL_FEATURES = new Set<ServerFeature>(["rdp", "vnc", "telnet"]);

export function pluginForFeature(feature: ServerFeature): string {
  return FEATURE_PLUGINS[feature];
}

/** Keeps only the plugins that are turned on and running. */
export function activePlugins(list: unknown): ServerPlugin[] | null {
  if (!Array.isArray(list)) return null;
  return list
    .filter(
      (p: any) =>
        p &&
        typeof p.id === "string" &&
        p.enabled !== false &&
        (p.state ?? "active") === "active",
    )
    .map((p: any) => {
      // Server entries carry contributes.protocols, cached ones a flat list.
      const raw = Array.isArray(p.contributes?.protocols)
        ? p.contributes.protocols.map((proto: any) => proto?.id)
        : p.protocols;
      const protocols = Array.isArray(raw)
        ? raw.filter((id: unknown): id is string => typeof id === "string")
        : undefined;
      return protocols ? { id: p.id, protocols } : { id: p.id };
    });
}

/**
 * Pre 2.9 servers have every feature built in, and an unknown plugin list
 * means we could not ask, so both say yes rather than hiding things.
 */
export function hasServerFeature(
  feature: ServerFeature,
  pluginApi: boolean,
  plugins: ServerPlugin[] | null,
): boolean {
  if (!pluginApi || !plugins) return true;
  const plugin = plugins.find((p) => p.id === FEATURE_PLUGINS[feature]);
  if (!plugin) return false;
  if (PROTOCOL_FEATURES.has(feature) && plugin.protocols) {
    return plugin.protocols.includes(feature);
  }
  return true;
}

const FILTER_FEATURES: Record<string, ServerFeature> = {
  rdp: "rdp",
  vnc: "vnc",
  telnet: "telnet",
  terminal: "terminal",
  fileManager: "fileManager",
  tunnel: "tunnels",
  docker: "docker",
};

/** Whether a host list filter option has a feature behind it on this server. */
export function filterOptionAvailable(
  value: string,
  has: (feature: ServerFeature) => boolean,
): boolean {
  const feature = FILTER_FEATURES[value];
  return feature ? has(feature) : true;
}

const SESSION_FEATURES: Record<string, ServerFeature> = {
  terminal: "terminal",
  stats: "metrics",
  filemanager: "fileManager",
  tunnel: "tunnels",
  docker: "docker",
};

/** The feature a session tab needs, so links to turned off ones can be refused. */
export function sessionFeature(
  type: string,
  remoteProtocol?: string,
): ServerFeature | null {
  if (type === "remoteDesktop") {
    return remoteProtocol === "vnc" || remoteProtocol === "telnet"
      ? remoteProtocol
      : "rdp";
  }
  return SESSION_FEATURES[type] ?? null;
}
