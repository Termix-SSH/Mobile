import type { AccountClient } from "../AccountClient";

export type PluginSettingsScope = "admin" | "user";
export type PluginSettingsValues = Record<string, unknown>;

const path = (pluginId: string, scope: PluginSettingsScope) =>
  `/plugins/${encodeURIComponent(pluginId)}/settings/${scope}`;

/** A plugin's server wide (admin) and per user settings from its manifest. */
export function createPluginSettingsApi(c: AccountClient) {
  async function get(
    pluginId: string,
    scope: PluginSettingsScope,
  ): Promise<PluginSettingsValues> {
    try {
      const response = await c.http.auth.get(path(pluginId, scope));
      return response.data?.values ?? {};
    } catch (error) {
      c.fail(error, "load plugin settings");
    }
  }

  /** Saves only the keys given; the rest stay as they are. */
  async function update(
    pluginId: string,
    scope: PluginSettingsScope,
    values: PluginSettingsValues,
  ): Promise<PluginSettingsValues> {
    try {
      const response = await c.http.auth.put(path(pluginId, scope), values);
      return response.data?.values ?? {};
    } catch (error) {
      c.fail(error, "save plugin settings");
    }
  }

  return { get, update };
}

export type PluginSettingsApi = ReturnType<typeof createPluginSettingsApi>;
