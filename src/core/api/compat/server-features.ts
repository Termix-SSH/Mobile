import {
  parseMobileContribution,
  type MobileContribution,
} from "@/core/plugins/mobile";
import {
  parseHostSettings,
  type PluginHostSettings,
} from "@/core/plugins/host-settings";

/** What a plugin web view needs from the server's plugin list. */
export interface PluginFrameInfo {
  /** Lucide icon name from the manifest. */
  icon?: string;
  /** A frontend.css sits beside the bundle. */
  css: boolean;
  /** Cache key for the bundle; changes when it is rebuilt. */
  assetVersion: string | null;
  /** "en" plus the xx_YY names of shipped translations. */
  locales: string[];
  /** The manifest's contributes, which the plugin's registrations are checked against. */
  contributes: Record<string, unknown>;
}

export interface ServerPlugin {
  id: string;
  name?: string;
  protocols?: string[];
  version?: string;
  /** Turned on and running. */
  active: boolean;
  /** Turned on by an admin, even when it did not start. */
  enabled?: boolean;
  /** The server's word for it: active, disabled, failed, safe-mode, ... */
  state?: string;
  /** The manifest's engine ranges (Termix 26.10.6+). */
  engine?: { api?: string; termix?: string };
  /** How the plugin shows in the app, from its manifest. */
  mobile?: MobileContribution;
  /** Set when the plugin has a web frontend. */
  frame?: PluginFrameInfo;
  /** The manifest's host settings, which the host editor can draw. */
  hostSettings?: PluginHostSettings;
}

function parseFrame(p: any): PluginFrameInfo | undefined {
  // Server entries say `frontend`, cached ones keep the parsed `frame`.
  const raw = p.frame ?? (p.frontend === true ? p : null);
  if (!raw || typeof raw !== "object") return undefined;
  const contributes =
    raw.contributes && typeof raw.contributes === "object"
      ? (raw.contributes as Record<string, unknown>)
      : {};
  const frame: PluginFrameInfo = {
    css: raw.css === true,
    assetVersion:
      typeof raw.assetVersion === "string" ? raw.assetVersion : null,
    locales: Array.isArray(raw.locales)
      ? raw.locales.filter((l: unknown): l is string => typeof l === "string")
      : ["en"],
    contributes,
  };
  if (typeof raw.icon === "string" && raw.icon) frame.icon = raw.icon;
  return frame;
}

function parseEngine(raw: any): ServerPlugin["engine"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: NonNullable<ServerPlugin["engine"]> = {};
  if (typeof raw.api === "string" && raw.api) out.api = raw.api;
  if (typeof raw.termix === "string" && raw.termix) out.termix = raw.termix;
  return out.api || out.termix ? out : undefined;
}

/**
 * Every plugin the server lists, on or off. Reads the server's `GET /plugins`
 * entries and the app's own cached copies of them.
 */
export function parseServerPlugins(list: unknown): ServerPlugin[] | null {
  if (!Array.isArray(list)) return null;
  return list
    .filter((p: any) => p && typeof p.id === "string")
    .map((p: any) => {
      // Server entries carry contributes.protocols, cached ones a flat list.
      const raw = Array.isArray(p.contributes?.protocols)
        ? p.contributes.protocols.map((proto: any) => proto?.id)
        : p.protocols;
      const protocols = Array.isArray(raw)
        ? raw.filter((id: unknown): id is string => typeof id === "string")
        : undefined;
      const active =
        typeof p.active === "boolean"
          ? p.active
          : p.enabled !== false && (p.state ?? "active") === "active";
      const out: ServerPlugin = { id: p.id, active };
      if (typeof p.enabled === "boolean") out.enabled = p.enabled;
      if (typeof p.state === "string" && p.state) out.state = p.state;
      const engine = parseEngine(p.engine);
      if (engine) out.engine = engine;
      if (typeof p.name === "string" && p.name) out.name = p.name;
      if (protocols) out.protocols = protocols;
      if (typeof p.version === "string") out.version = p.version;
      const mobile = parseMobileContribution(p.contributes?.mobile ?? p.mobile);
      if (mobile) out.mobile = mobile;
      const frame = parseFrame(p);
      if (frame) out.frame = frame;
      const hostSettings = parseHostSettings(
        p.contributes?.settings?.host ?? p.hostSettings,
      );
      if (hostSettings) out.hostSettings = hostSettings;
      return out;
    });
}
