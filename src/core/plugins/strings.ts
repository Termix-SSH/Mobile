import type { AccountClient } from "@/core/api/AccountClient";

const memory = new Map<string, Promise<Record<string, unknown> | undefined>>();

/**
 * A plugin's English strings from the server, for labels the app draws from
 * its manifest. Undefined when the server has none or can't be reached.
 */
export function loadPluginStrings(
  client: AccountClient,
  pluginId: string,
  version?: string,
): Promise<Record<string, unknown> | undefined> {
  const key = `${client.accountId}:${pluginId}:${version ?? ""}`;
  let hit = memory.get(key);
  if (!hit) {
    const query = version ? `?v=${encodeURIComponent(version)}` : "";
    const url = `${client.rootBase()}/plugin-assets/${encodeURIComponent(pluginId)}/locales/en.json${query}`;
    hit = client
      .fetch(url, { headers: client.sessionHeaders() })
      .then(async (res) => {
        if (!res.ok) return undefined;
        const value = JSON.parse(await res.text());
        return value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : undefined;
      })
      .catch(() => undefined);
    hit.then((value) => {
      if (!value) memory.delete(key);
    });
    memory.set(key, hit);
  }
  return hit;
}
