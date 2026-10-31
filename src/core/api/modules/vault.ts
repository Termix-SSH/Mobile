import axios from "axios";
import type { AccountClient } from "../AccountClient";
import { isHtmlPayload } from "../http";

export interface VaultProfile {
  id: number;
  name: string;
  vaultAddr?: string;
  sshRole?: string;
}

export function parseVaultProfiles(data: unknown): VaultProfile[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { profiles?: unknown })?.profiles)
      ? (data as { profiles: unknown[] }).profiles
      : [];
  return list
    .map((p) => p as Record<string, unknown>)
    .filter(
      (p) => Number.isFinite(Number(p?.id)) && typeof p?.name === "string",
    )
    .map((p) => ({
      id: Number(p.id),
      name: p.name as string,
      vaultAddr: typeof p.vaultAddr === "string" ? p.vaultAddr : undefined,
      sshRole: typeof p.sshRole === "string" ? p.sshRole : undefined,
    }));
}

export function createVaultApi(c: AccountClient) {
  function isVaultAvailable(): boolean {
    return c.supports({ plugin: "vault", pluginApiOnly: true });
  }

  /** The signed in user's Vault profiles; null when the plugin is not on this server. */
  async function listProfiles(): Promise<VaultProfile[] | null> {
    try {
      const response = await c.http.auth.get("/plugin-api/vault/profiles", {
        baseURL: c.rootBase(),
      });
      if (isHtmlPayload(response.data)) return null;
      return parseVaultProfiles(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        if (error.response.status === 403) return [];
        if (error.response.status === 404 || isHtmlPayload(error.response.data))
          return null;
      }
      throw error;
    }
  }

  return { isVaultAvailable, listProfiles };
}

export type VaultApi = ReturnType<typeof createVaultApi>;
