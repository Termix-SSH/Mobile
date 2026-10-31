import axios from "axios";
import type { AccountClient } from "../AccountClient";
import { isHtmlPayload } from "../http";
import {
  parseTailscaleDevicesResponse,
  type TailscaleDevicesResult,
} from "@/features/tailscale/tailscale";

export function createTailscaleApi(c: AccountClient) {
  function isTailscaleAvailable(): boolean {
    return c.supports({ plugin: "tailscale", pluginApiOnly: true });
  }

  async function getTailscaleDevices(): Promise<TailscaleDevicesResult | null> {
    try {
      const response = await c.http.auth.get("/plugin-api/tailscale/devices", {
        baseURL: c.rootBase(),
      });
      return parseTailscaleDevicesResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const result = parseTailscaleDevicesResponse(error.response.data);
        if (error.response.status === 403) {
          return {
            devices: [],
            hasApiKey: result?.hasApiKey ?? false,
            error: "forbidden",
          };
        }
        if (error.response.status === 404 || isHtmlPayload(error.response.data))
          return null;
        if (result) return result;
      }
      throw error;
    }
  }

  return { isTailscaleAvailable, getTailscaleDevices };
}

export type TailscaleApi = ReturnType<typeof createTailscaleApi>;
