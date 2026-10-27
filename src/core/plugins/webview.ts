import type {
  PluginFrameInfo,
  ServerPlugin,
} from "@/core/api/compat/server-features";
import type { FeatureRegistry } from "@/core/features/registry";
import type { SSHHost } from "@/types";
import { catalogEntry, type HostGate } from "./catalog";
import { apiFit, type ApiFit } from "./compat";

/** One plugin view the app can open in a web view. */
export interface FrameView {
  /** The plugin's tab or panel id. */
  view: string;
  titleKey?: string;
  /** Lucide icon name. */
  icon?: string;
  /** Opens from a host (the tab lists `host-context-menu`). */
  host: boolean;
  /** The host setting that must be on for the view to show on a host. */
  gate?: HostGate;
}

export interface FramePlugin {
  id: string;
  name: string;
  icon?: string;
  /** The bundle beside frontend.js the app loads. */
  entry: string;
  frame: PluginFrameInfo;
  views: FrameView[];
  /** Its engine.api against the app's copy of the SDK. */
  fit: ApiFit;
}

interface TabEntry {
  id?: unknown;
  titleKey?: unknown;
  icon?: unknown;
  openFrom?: unknown;
}

function asList(value: unknown): TabEntry[] {
  return Array.isArray(value)
    ? value.filter((v): v is TabEntry => !!v && typeof v === "object")
    : [];
}

function viewsOf(frame: PluginFrameInfo, wanted?: string[]): FrameView[] {
  const out: FrameView[] = [];
  const add = (entry: TabEntry, host: boolean) => {
    if (typeof entry.id !== "string" || !entry.id) return;
    if (out.some((v) => v.view === entry.id)) return;
    out.push({
      view: entry.id,
      titleKey: typeof entry.titleKey === "string" ? entry.titleKey : undefined,
      icon: typeof entry.icon === "string" ? entry.icon : undefined,
      host,
    });
  };
  for (const tab of asList(frame.contributes.tabs)) {
    const from = Array.isArray(tab.openFrom) ? tab.openFrom : [];
    add(tab, from.includes("host-context-menu"));
  }
  // Panels are offered only when the manifest names them for the app.
  if (wanted) {
    for (const panel of asList(frame.contributes.panels)) add(panel, false);
    return out.filter((v) => wanted.includes(v.view));
  }
  return out;
}

/**
 * The plugin as a web view, or null when the app shows it some other way or
 * not at all. Official plugins are mapped by the catalog; others must say
 * `contributes.mobile.mode: "webview"`.
 */
export function framePlugin(
  plugin: ServerPlugin,
  registry: FeatureRegistry,
  device: "phone" | "tablet",
): FramePlugin | null {
  if (!plugin.active || !plugin.frame) return null;
  // The app's own screens win.
  if (registry.forPlugin(plugin.id).some((def) => def.source !== "webview")) {
    return null;
  }
  const mobile = plugin.mobile;
  if (mobile) {
    if (mobile.mode !== "webview") return null;
    if (mobile.sizes && !mobile.sizes.includes(device)) return null;
  } else if (catalogEntry(plugin.id)?.kind !== "webview") {
    return null;
  }
  const gates = catalogEntry(plugin.id)?.hostGates;
  const views = viewsOf(plugin.frame, mobile?.views).map((view) =>
    gates?.[view.view] ? { ...view, gate: gates[view.view] } : view,
  );
  if (!views.length) return null;
  return {
    id: plugin.id,
    name: plugin.name ?? catalogEntry(plugin.id)?.name ?? plugin.id,
    icon: plugin.frame.icon,
    entry: mobile?.entry ?? "frontend.js",
    frame: plugin.frame,
    views,
    fit: apiFit(plugin.engine?.api, "webview"),
  };
}

/** Every plugin on the server that opens in a web view. */
export function framePlugins(
  plugins: ServerPlugin[] | null,
  registry: FeatureRegistry,
  device: "phone" | "tablet",
): FramePlugin[] {
  return (plugins ?? [])
    .map((plugin) => framePlugin(plugin, registry, device))
    .filter((p): p is FramePlugin => !!p)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether a host view should show for this host. */
export function hostAllows(
  pluginId: string,
  view: FrameView,
  host: Pick<SSHHost, "enableSsh" | "pluginSettings">,
): boolean {
  if (!view.gate) return true;
  if (view.gate.ssh && host.enableSsh === false) return false;
  return host.pluginSettings?.[pluginId]?.[view.gate.setting] === true;
}

/** A label for a view when its strings have not loaded: "proxmox-stats" is "Proxmox stats". */
export function viewLabel(plugin: FramePlugin, view: FrameView): string {
  if (plugin.views.length === 1) return plugin.name;
  const words = view.view.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Looks a key up in a plugin's locale file, nested by dots. */
export function translate(
  strings: Record<string, unknown> | undefined,
  key: string | undefined,
): string | null {
  if (!strings || !key) return null;
  let node: unknown = strings;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : null;
}
