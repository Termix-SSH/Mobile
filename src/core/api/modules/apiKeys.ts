import type { AccountClient } from "../AccountClient";

import type { ApiKey } from "../types";

export function createApiKeysApi(c: AccountClient) {
  async function getApiKeys(): Promise<{ apiKeys: ApiKey[] }> {
    try {
      const response = await c.http.auth.get("/users/api-keys");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch API keys");
    }
  }

  async function createApiKey(
    name: string,
    userId: string,
    expiresAt?: string,
  ): Promise<{ apiKey: ApiKey & { key: string; token: string } }> {
    try {
      const response = await c.http.auth.post("/users/api-keys", {
        name,
        userId,
        expiresAt: expiresAt ?? null,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "create API key");
    }
  }

  async function deleteApiKey(keyId: string): Promise<void> {
    try {
      await c.http.auth.delete(`/users/api-keys/${keyId}`);
    } catch (error) {
      c.fail(error, "delete API key");
    }
  }

  return { getApiKeys, createApiKey, deleteApiKey };
}

export type ApiKeysApi = ReturnType<typeof createApiKeysApi>;
