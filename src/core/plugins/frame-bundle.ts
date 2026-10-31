import { Directory, File, Paths } from "expo-file-system";
import type { AccountClient } from "@/core/api/AccountClient";
import type { FrameBoot } from "./frame-protocol";
import type { FramePlugin } from "./webview";

/**
 * A plugin's code, styles and strings. Nothing a plugin screen draws is ever
 * kept, since it can show secrets and live numbers.
 */
export interface FrameBundle {
  code: string;
  css: string | null;
  locales: FrameBoot["locales"];
}

const memory = new Map<string, FrameBundle>();

function cacheFile(accountId: string, plugin: FramePlugin): File | null {
  const version = plugin.frame.assetVersion;
  if (!version) return null;
  const safe = (value: string) => value.replace(/[^\w.-]/g, "_");
  return new File(
    Paths.cache,
    "plugin-frames",
    safe(accountId),
    `${safe(plugin.id)}-${safe(version)}.json`,
  );
}

/** The translation file name for the phone's language, when the plugin ships it. */
export function pickLocale(
  available: string[],
  deviceLocale: string,
): string | undefined {
  const [lang, region] = deviceLocale.replace("-", "_").split("_");
  if (!lang || lang === "en") return undefined;
  const exact = region ? `${lang}_${region.toUpperCase()}` : null;
  if (exact && available.includes(exact)) return exact;
  return available.find((name) => name.startsWith(`${lang}_`));
}

/** The server answered, so a cached copy would be out of date. */
class ServerAnswer extends Error {}

async function fetchText(
  client: AccountClient,
  url: string,
): Promise<string | null> {
  const res = await client.fetch(url, { headers: client.sessionHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new ServerAnswer(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchJson(client: AccountClient, url: string) {
  const text = await fetchText(client, url);
  if (!text) return undefined;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Builds the asset URL the way core does, with the version as cache key. */
export function assetUrl(
  client: AccountClient,
  plugin: FramePlugin,
  file: string,
): string {
  const version = plugin.frame.assetVersion;
  const query = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${client.rootBase()}/plugin-assets/${encodeURIComponent(plugin.id)}/${file}${query}`;
}

async function download(
  client: AccountClient,
  plugin: FramePlugin,
  language: string | undefined,
): Promise<FrameBundle> {
  const [code, css, en, translated] = await Promise.all([
    fetchText(client, assetUrl(client, plugin, plugin.entry)),
    plugin.frame.css
      ? fetchText(client, assetUrl(client, plugin, "frontend.css"))
      : Promise.resolve(null),
    fetchJson(client, assetUrl(client, plugin, "locales/en.json")),
    language
      ? fetchJson(
          client,
          assetUrl(client, plugin, `locales/translated/${language}.json`),
        )
      : Promise.resolve(undefined),
  ]);
  if (!code) throw new ServerAnswer(`${plugin.name} has no ${plugin.entry}`);
  return {
    code,
    css,
    locales: { language, en, translated },
  };
}

/**
 * Loads the bundle through the account's client, so the login, proxy headers
 * and client certificate apply. Falls back to the copy cached for the same
 * version only when the server can't be reached at all.
 */
export async function loadFrameBundle(
  client: AccountClient,
  plugin: FramePlugin,
  deviceLocale = Intl.DateTimeFormat().resolvedOptions().locale,
): Promise<{ bundle: FrameBundle; cached: boolean }> {
  const language = pickLocale(plugin.frame.locales, deviceLocale);
  const key = `${client.accountId}:${plugin.id}:${plugin.frame.assetVersion}:${language ?? "en"}`;
  const hit = plugin.frame.assetVersion ? memory.get(key) : undefined;
  if (hit) return { bundle: hit, cached: false };

  const file = cacheFile(client.accountId, plugin);
  try {
    const bundle = await download(client, plugin, language);
    if (plugin.frame.assetVersion) memory.set(key, bundle);
    if (file) {
      try {
        const dir = new Directory(file.parentDirectory.uri);
        if (!dir.exists) dir.create({ intermediates: true });
        file.write(JSON.stringify(bundle));
      } catch {
        // A full disk only costs the offline copy.
      }
    }
    return { bundle, cached: false };
  } catch (error) {
    if (!(error instanceof ServerAnswer) && file?.exists) {
      try {
        return {
          bundle: JSON.parse(await file.text()) as FrameBundle,
          cached: true,
        };
      } catch {
        // Fall through to the network error.
      }
    }
    throw error;
  }
}

/** Removes an account's cached plugin code, after unlinking it. */
export function clearFrameCache(accountId: string): void {
  try {
    const dir = new Directory(
      Paths.cache,
      "plugin-frames",
      accountId.replace(/[^\w.-]/g, "_"),
    );
    if (dir.exists) dir.delete();
  } catch {
    // Cache folders can vanish under us; nothing to do.
  }
}

/** Test seam. */
export function resetFrameMemory(): void {
  memory.clear();
}
