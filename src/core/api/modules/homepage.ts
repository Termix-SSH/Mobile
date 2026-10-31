import { isAxiosError } from "axios";
import type { AccountClient } from "../AccountClient";
import type { UptimeInfo, RecentActivityItem } from "@/types/index";

export function createHomepageApi(c: AccountClient) {
  async function getUptime(): Promise<UptimeInfo> {
    try {
      const response = await c.http.auth.get("/uptime");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch uptime");
      throw error;
    }
  }

  async function getRecentActivity(
    limit?: number,
  ): Promise<RecentActivityItem[]> {
    try {
      const response = await c.http.auth.get("/activity/recent", {
        params: { limit },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "fetch recent activity");
      throw error;
    }
  }

  async function logActivity(
    type: "terminal" | "file_manager",
    hostId: number,
    hostName: string,
  ): Promise<{ message: string; id: number | string }> {
    try {
      const response = await c.http.auth.post("/activity/log", {
        type,
        hostId,
        hostName,
      });
      return response.data;
    } catch (error) {
      // Expected on servers without the Homepage plugin.
      if (isAxiosError(error) && error.response?.status === 404) throw error;
      c.fail(error, "log activity");
      throw error;
    }
  }

  async function resetRecentActivity(): Promise<{ message: string }> {
    try {
      const response = await c.http.auth.delete("/activity/reset");
      return response.data;
    } catch (error) {
      c.fail(error, "reset recent activity");
      throw error;
    }
  }

  return { getUptime, getRecentActivity, logActivity, resetRecentActivity };
}

export type HomepageApi = ReturnType<typeof createHomepageApi>;
