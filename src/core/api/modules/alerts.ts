import type { AccountClient } from "../AccountClient";

export function createAlertsApi(c: AccountClient) {
  async function getUserAlerts(): Promise<{ alerts: any[] }> {
    try {
      if (c.apiGeneration === "plugin") {
        if (!c.isPluginEnabled("alerts")) return { alerts: [] };
        const response = await c.http.auth.get("/plugin-api/alerts/items", {
          params: { unread: true, limit: 20 },
        });
        const items = Array.isArray(response.data?.items)
          ? response.data.items
          : [];
        return {
          alerts: items.map((item: any) => ({
            id: String(item.id),
            title: item.title,
            message: item.body ?? "",
            type: item.severity,
            createdAt: item.createdAt,
          })),
        };
      }
      const response = await c.http.auth.get(`/alerts`);
      return response.data;
    } catch (error) {
      c.fail(error, "fetch user alerts");
    }
  }

  async function dismissAlert(alertId: string): Promise<any> {
    try {
      if (c.apiGeneration === "plugin") {
        // 2.9 keeps alerts in an inbox; dismissing here marks it read.
        const response = await c.http.auth.post(
          "/plugin-api/alerts/items/read",
          {
            ids: [Number(alertId)],
          },
        );
        return response.data;
      }
      const response = await c.http.auth.post("/alerts/dismiss", { alertId });
      return response.data;
    } catch (error) {
      c.fail(error, "dismiss alert");
    }
  }

  return { getUserAlerts, dismissAlert };
}

export type AlertsApi = ReturnType<typeof createAlertsApi>;
