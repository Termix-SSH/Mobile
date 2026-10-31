import type { ServerPlugin } from "@/core/api/compat/server-features";
import type { FeatureRegistry } from "@/core/features/registry";
import type { FeatureDef } from "@/core/features/types";
import { OFFICIAL_PLUGINS, catalogEntry } from "./catalog";
import { apiFit, type ApiFit } from "./compat";

/**
 * - `native`: the app has its own screens.
 * - `webview`: the plugin's UI from the server, in the app.
 * - `app`: the app does it itself, outside any feature.
 * - `server`: it works on the server and the app uses the result.
 * - `look`: a layout or theme, the app has its own.
 * - `none`: nothing in the app.
 */
export type SupportMode =
  "native" | "webview" | "app" | "server" | "look" | "none";

/**
 * Where the plugin is on the account's server: `none` for This device,
 * `unknown` when the server has not said (older servers have everything),
 * `failed` when it is turned on but not running.
 */
export type ServerState =
  "on" | "off" | "failed" | "missing" | "unknown" | "none";

export type SupportSection = "phone" | "server" | "absent";

export interface SupportRow {
  /** Plugin id, or the feature id for app features no plugin backs. */
  id: string;
  name: string;
  mode: SupportMode;
  /** Works with no server. */
  onDevice: boolean;
  server: ServerState;
  /** The server's state word when it is not plain on or off, like safe-mode. */
  serverDetail?: string;
  /** The plugin asks for an app screen this build does not have. */
  needsNewerApp?: boolean;
  /** The plugin's engine.api against what the app understands. */
  fit: ApiFit;
  /** Version on the server. */
  version?: string;
  /** The plugin's engine.api range, when the server sends it. */
  engineApi?: string;
  note?: string;
  section: SupportSection;
  status: string;
}

export interface SupportInput {
  registry: FeatureRegistry;
  /** The account is This device. */
  local: boolean;
  /** Every plugin the server listed, on or off. Null when unknown. */
  plugins: ServerPlugin[] | null;
}

function onPhone(defs: FeatureDef[]): boolean {
  return defs.some((def) => (def.availableOn ?? ["server"]).includes("local"));
}

/** On, off, or turned on but not running (failed, safe mode, still loading). */
export function pluginState(plugin: ServerPlugin): "on" | "off" | "failed" {
  if (plugin.active) return "on";
  if (plugin.enabled && plugin.state && plugin.state !== "disabled") {
    return "failed";
  }
  return "off";
}

function serverState(input: SupportInput, id: string): ServerState {
  if (input.local) return "none";
  if (!input.plugins) return "unknown";
  const plugin = input.plugins.find((p) => p.id === id);
  if (!plugin) return "missing";
  return pluginState(plugin);
}

/** What the plugin does in the app, in order: app features, its manifest, the catalog. */
function modeFor(
  defs: FeatureDef[],
  plugin: ServerPlugin | undefined,
  id: string,
): { mode: SupportMode; needsNewerApp?: boolean } {
  if (defs.length) return { mode: "native" };
  const mobile = plugin?.mobile;
  if (mobile?.mode === "webview") return { mode: "webview" };
  if (mobile?.mode === "native") return { mode: "none", needsNewerApp: true };
  if (mobile?.mode === "none") return { mode: "none" };
  return { mode: catalogEntry(id)?.kind ?? "none" };
}

/** Only plugins the app talks to have to match its plugin API. */
function fitFor(mode: SupportMode, plugin: ServerPlugin | undefined): ApiFit {
  if (mode !== "webview" && mode !== "native") return "ok";
  return apiFit(plugin?.engine?.api, mode);
}

/** A locale key needs the plugin's strings, which the app does not load yet. */
function plainNote(note: string | undefined): string | undefined {
  return note && /\s/.test(note) ? note : undefined;
}

function serverWord(state: ServerState): string | null {
  switch (state) {
    case "off":
      return "off on this server";
    case "failed":
      return "not running on this server";
    case "missing":
      return "not on this server";
    default:
      return null;
  }
}

/** The plain line under a row's name. */
export function describeSupport(
  row: Pick<
    SupportRow,
    "mode" | "onDevice" | "server" | "needsNewerApp" | "fit"
  >,
): string {
  const { mode, onDevice, server } = row;
  if (row.needsNewerApp || row.fit === "update-app") {
    return "Needs a newer version of the app";
  }
  if (row.fit === "update-plugin") return "Update the plugin on the server";
  if (mode === "look") return "The app has its own look";
  if (mode === "none") {
    return server === "on"
      ? "Not in the app yet | on this server"
      : "Not in the app yet";
  }
  const reach = serverWord(server);
  if (onDevice) {
    if (server === "none") return "Works on this phone";
    if (server === "on" || server === "unknown") return "Phone and server";
    return `Phone only | ${reach}`;
  }
  if (server === "none") return "Link a server to use it";
  if (reach) return reach.charAt(0).toUpperCase() + reach.slice(1);
  if (mode === "webview") return "Opens in the app from the server";
  return mode === "server" ? "Runs on the server" : "Through the server";
}

/** How the plugin shows in the app, in a word or two. */
export function modeLabel(mode: SupportMode): string {
  switch (mode) {
    case "native":
    case "app":
      return "In the app";
    case "webview":
      return "Web view";
    case "server":
      return "On the server";
    case "look":
      return "App look";
    default:
      return "Not in the app";
  }
}

/** The server side state in a word or two. */
export function stateLabel(row: Pick<SupportRow, "server" | "serverDetail">) {
  switch (row.server) {
    case "on":
      return "On";
    case "off":
      return "Off";
    case "failed":
      return row.serverDetail === "safe-mode" ? "Safe mode" : "Not running";
    case "missing":
      return "Not installed";
    default:
      return "";
  }
}

function sectionFor(
  row: Pick<SupportRow, "mode" | "onDevice">,
): SupportSection {
  if (row.onDevice) return "phone";
  if (row.mode === "none" || row.mode === "look") return "absent";
  return "server";
}

function finish(row: Omit<SupportRow, "section" | "status">): SupportRow {
  return { ...row, section: sectionFor(row), status: describeSupport(row) };
}

/**
 * One row per official plugin, per other plugin the server has, and per app
 * feature no plugin backs, sorted by name.
 */
export function supportRows(input: SupportInput): SupportRow[] {
  const ids = new Set(OFFICIAL_PLUGINS.map((entry) => entry.id));
  for (const plugin of input.plugins ?? []) ids.add(plugin.id);

  const rows: SupportRow[] = [];
  for (const id of ids) {
    const plugin = input.plugins?.find((p) => p.id === id);
    // A plugin's own web view feature is the plugin itself, not an app screen.
    const defs = input.registry
      .forPlugin(id)
      .filter((def) => def.source !== "webview");
    const { mode, needsNewerApp } = modeFor(defs, plugin, id);
    const server = serverState(input, id);
    const row = finish({
      id,
      name: plugin?.name ?? catalogEntry(id)?.name ?? id,
      mode,
      onDevice: mode === "app" || (mode === "native" && onPhone(defs)),
      server,
      serverDetail: server === "failed" ? plugin?.state : undefined,
      needsNewerApp,
      fit: fitFor(mode, plugin),
      version: plugin?.version,
      engineApi: plugin?.engine?.api,
      note: plainNote(plugin?.mobile?.note),
    });
    rows.push(row);
  }

  for (const def of input.registry.all()) {
    if (def.plugins?.length || def.requires) continue;
    const on = def.availableOn ?? ["server"];
    if (rows.some((row) => row.id === def.id)) continue;
    rows.push(
      finish({
        id: def.id,
        name: def.title,
        mode: "native",
        onDevice: on.includes("local"),
        server: input.local ? "none" : on.includes("server") ? "on" : "missing",
        fit: "ok",
      }),
    );
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** A plugin nobody runs and the app can't show, left out of the full list. */
export function isNoise(row: SupportRow): boolean {
  return !catalogEntry(row.id) && row.mode === "none" && row.server !== "on";
}

/** Rows for the plugins the server itself lists, for its Plugins list. */
export function serverRows(
  rows: SupportRow[],
  plugins: ServerPlugin[] | null,
): SupportRow[] {
  if (!plugins) return [];
  const ids = new Set(plugins.map((p) => p.id));
  return rows.filter((row) => ids.has(row.id));
}

/** Why a plugin can't open, in plain words. */
export function unavailableText(entry: ServerPlugin | null): {
  title: string;
  hint: string;
} {
  if (!entry) {
    return {
      title: "Not on this server",
      hint: "The plugin is not installed on this server.",
    };
  }
  const state = pluginState(entry);
  if (state === "off") {
    return {
      title: "Turned off on the server",
      hint: "It opens here again when an admin turns it on.",
    };
  }
  if (state === "failed") {
    return {
      title: "Not running on the server",
      hint:
        entry.state === "safe-mode"
          ? "The server is in safe mode, so only look plugins run."
          : "The plugin did not start. An admin can check it in Plugins.",
    };
  }
  return {
    title: "This plugin is not available",
    hint: "It is not made for the app.",
  };
}
