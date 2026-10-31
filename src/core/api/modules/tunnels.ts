import axios from "axios";
import type { AccountClient } from "../AccountClient";
import { toSavedTunnel } from "../compat/api-compat";
import type {
  TunnelConfig,
  TunnelConnection,
  PluginTunnelConnect,
  TunnelStatus,
} from "@/types/index";

export interface Gateway {
  id: number;
  name: string;
  endpoint?: string;
  listenPort?: number;
  publicIp?: string;
  privateIp?: string;
  ports: {
    id: number;
    proto: "tcp" | "udp" | "both";
    publicPort: number;
    targetPort: number;
    label?: string;
    enabled: boolean;
  }[];
  status: {
    state: string;
    message: string | null;
    handshakeAge: number | null;
  };
}

export function createTunnelsApi(c: AccountClient) {
  async function getTunnelStatuses(): Promise<Record<string, TunnelStatus>> {
    try {
      const response = await c.http.tunnel.get("/tunnel/status");
      return response.data || {};
    } catch (error) {
      c.fail(error, "fetch tunnel statuses");
    }
  }

  async function getTunnelStatusByName(
    tunnelName: string,
  ): Promise<TunnelStatus | undefined> {
    const statuses = await getTunnelStatuses();
    return statuses[tunnelName];
  }

  async function connectTunnel(
    tunnelConfig: TunnelConfig | PluginTunnelConnect,
  ): Promise<any> {
    try {
      const response = await c.http.tunnel.post(
        "/tunnel/connect",
        tunnelConfig,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "connect tunnel");
    }
  }

  async function disconnectTunnel(tunnelName: string): Promise<any> {
    try {
      const response = await c.http.tunnel.post("/tunnel/disconnect", {
        tunnelName,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "disconnect tunnel");
    }
  }

  async function cancelTunnel(tunnelName: string): Promise<any> {
    try {
      const response = await c.http.tunnel.post("/tunnel/cancel", {
        tunnelName,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "cancel tunnel");
    }
  }

  const is404 = (e: unknown) =>
    axios.isAxiosError(e) && e.response?.status === 404;

  /**
   * Saved tunnels of every host the account can list (plugin 1.2.0+).
   * Null when the plugin is older and has no saved routes.
   */
  async function getSavedTunnels(): Promise<Record<
    number,
    TunnelConnection[]
  > | null> {
    try {
      const response = await c.http.auth.get("/plugin-api/tunnels/saved");
      const out: Record<number, TunnelConnection[]> = {};
      for (const row of Array.isArray(response.data) ? response.data : []) {
        if (Number.isFinite(Number(row?.hostId))) {
          out[Number(row.hostId)] = Array.isArray(row.connections)
            ? row.connections
            : [];
        }
      }
      return out;
    } catch (error) {
      if (is404(error)) return null;
      c.fail(error, "fetch saved tunnels");
    }
  }

  /** Replaces the host's whole list. An empty list removes the row. */
  async function putSavedTunnels(
    hostId: number,
    connections: TunnelConnection[],
  ): Promise<void> {
    try {
      await c.http.auth.put(`/plugin-api/tunnels/saved/${hostId}`, {
        connections: connections.map(toSavedTunnel),
      });
    } catch (error) {
      if (is404(error)) {
        // Older plugin: the list lives in the host setting.
        await c.http.auth
          .put(`/plugins/tunnels/settings/host/${hostId}`, {
            tunnelConnections: connections,
          })
          .catch((e) => c.fail(e, "save tunnels"));
        return;
      }
      c.fail(error, "save tunnels");
    }
  }

  /** WireGuard gateways, read only. Empty when the plugin has none or is older. */
  async function getGateways(): Promise<Gateway[]> {
    try {
      const response = await c.http.auth.get("/plugin-api/tunnels/gateways");
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      if (is404(error)) return [];
      c.fail(error, "fetch gateways");
    }
  }

  return {
    getTunnelStatuses,
    getTunnelStatusByName,
    connectTunnel,
    disconnectTunnel,
    cancelTunnel,
    getSavedTunnels,
    putSavedTunnels,
    getGateways,
  };
}

export type TunnelsApi = ReturnType<typeof createTunnelsApi>;
