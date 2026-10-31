import type { AccountClient } from "../AccountClient";

import type {
  OpenTabRecord,
  OpenTabUpsertPayload,
  ActiveSessionInfo,
} from "../types";

export function createOpenTabsApi(c: AccountClient) {
  async function getOpenTabs(): Promise<OpenTabRecord[]> {
    try {
      const response = await c.http.auth.get("/open-tabs");
      return Array.isArray(response.data) ? response.data : [];
    } catch {
      return [];
    }
  }

  async function addOpenTab(tab: OpenTabUpsertPayload): Promise<void> {
    try {
      await c.http.auth.post("/open-tabs", tab);
    } catch {
      // best-effort; cross-device sync is non-critical to local use
    }
  }

  async function patchOpenTab(
    instanceId: string,
    updates: Partial<
      Pick<OpenTabRecord, "label" | "tabOrder" | "backendSessionId">
    >,
  ): Promise<void> {
    try {
      await c.http.auth.patch(`/open-tabs/${instanceId}`, updates);
    } catch {
      // best-effort
    }
  }

  async function deleteOpenTab(instanceId: string): Promise<void> {
    try {
      await c.http.auth.delete(`/open-tabs/${instanceId}`);
    } catch {
      // best-effort
    }
  }

  async function getActiveSessions(): Promise<ActiveSessionInfo[]> {
    try {
      const response = await c.http.auth.get("/open-tabs/active-sessions");
      return Array.isArray(response.data) ? response.data : [];
    } catch {
      return [];
    }
  }

  return {
    getOpenTabs,
    addOpenTab,
    patchOpenTab,
    deleteOpenTab,
    getActiveSessions,
  };
}

export type OpenTabsApi = ReturnType<typeof createOpenTabsApi>;
