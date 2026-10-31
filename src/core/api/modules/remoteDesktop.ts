import type { AccountClient } from "../AccountClient";
import {
  remoteDesktopConnectBody,
  type RdpCredentials,
} from "@/features/remote-desktop/rdp-login";

export function createRemoteDesktopApi(c: AccountClient) {
  async function getGuacamoleTokenFromHost(
    hostId: number,
    protocol?: "rdp" | "vnc" | "telnet",
    credentials?: RdpCredentials,
  ): Promise<{ token: string }> {
    try {
      const response = await c.http.auth.post(
        `/guacamole/connect-host/${hostId}`,
        remoteDesktopConnectBody(protocol, credentials),
      );
      return response.data;
    } catch (error) {
      c.fail(error, "connect Guacamole host");
    }
  }

  return { getGuacamoleTokenFromHost };
}

export type RemoteDesktopApi = ReturnType<typeof createRemoteDesktopApi>;
