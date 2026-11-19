import type { AccountClient } from "../AccountClient";

export interface AlertItem {
  id: string;
  title: string;
  message: string;
  severity: string;
  source?: string;
  createdAt?: string;
  read: boolean;
}

export interface AlertPage {
  items: AlertItem[];
  unread: number;
}

export function createAlertsApi(c: AccountClient) {
  const inbox = () => c.apiGeneration === "plugin";

  /** False when the server has no alerts for this user. */
  function available(): boolean {
    return !inbox() || c.isPluginEnabled("alerts");
  }

  async function list(
    opts: { unread?: boolean; before?: string; limit?: number } = {},
  ): Promise<AlertPage> {
    if (!available()) return { items: [], unread: 0 };
    try {
      if (inbox()) {
        const response = await c.http.auth.get("/plugin-api/alerts/items", {
          params: {
            unread: opts.unread ? true : undefined,
            before: opts.before,
            limit: opts.limit ?? 50,
          },
        });
        const items = Array.isArray(response.data?.items)
          ? response.data.items
          : [];
        return {
          items: items.map((item: any) => ({
            id: String(item.id),
            title: item.title,
            message: item.body ?? "",
            severity: item.severity ?? "info",
            source: item.source,
            createdAt: item.createdAt,
            read: !!item.readAt,
          })),
          unread: Number(response.data?.unread) || 0,
        };
      }
      const response = await c.http.auth.get(`/alerts`);
      const alerts = Array.isArray(response.data?.alerts)
        ? response.data.alerts
        : [];
      return {
        items: alerts.map((a: any) => ({
          id: String(a.id),
          title: a.title,
          message: a.message ?? "",
          severity: a.type ?? "info",
          createdAt: a.createdAt,
          read: false,
        })),
        unread: alerts.length,
      };
    } catch (error) {
      c.fail(error, "fetch alerts");
    }
  }

  async function unreadCount(): Promise<number> {
    if (!available()) return 0;
    if (!inbox()) return (await list()).unread;
    try {
      const response = await c.http.auth.get("/plugin-api/alerts/unread");
      return Number(response.data?.count) || 0;
    } catch (error) {
      c.fail(error, "count alerts");
    }
  }

  /** Marks alerts read. Older servers only know dismiss, which hides them. */
  async function markRead(ids: string[] | "all"): Promise<void> {
    try {
      if (inbox()) {
        await c.http.auth.post(
          "/plugin-api/alerts/items/read",
          ids === "all" ? { all: true } : { ids: ids.map(Number) },
        );
        return;
      }
      const list_ = ids === "all" ? (await list()).items.map((a) => a.id) : ids;
      for (const alertId of list_) {
        await c.http.auth.post("/alerts/dismiss", { alertId });
      }
    } catch (error) {
      c.fail(error, "mark alerts read");
    }
  }

  /** Deletes one alert. Older servers dismiss it instead. */
  async function remove(id: string): Promise<void> {
    if (!inbox()) return markRead([id]);
    try {
      await c.http.auth.delete(`/plugin-api/alerts/items/${Number(id)}`);
    } catch (error) {
      c.fail(error, "delete alert");
    }
  }

  /** Clears alerts, or only the read ones. */
  async function clear(readOnly: boolean): Promise<void> {
    if (!inbox()) return markRead("all");
    try {
      await c.http.auth.delete("/plugin-api/alerts/items", {
        params: readOnly ? { read: true } : undefined,
      });
    } catch (error) {
      c.fail(error, "clear alerts");
    }
  }

  /** True when delete and clear really remove alerts. */
  const canDelete = () => inbox();

  return { available, list, unreadCount, markRead, remove, clear, canDelete };
}

export type AlertsApi = ReturnType<typeof createAlertsApi>;
