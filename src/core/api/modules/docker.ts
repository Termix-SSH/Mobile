import { type AxiosInstance } from "axios";
import type { AccountClient } from "../AccountClient";
import type {
  DockerContainer,
  DockerContainerStats,
  DockerContainerAction as DockerActionType,
  SessionAuthOverrides,
} from "@/types/index";

export function createDockerApi(c: AccountClient) {
  // nginx routes /docker/* from the server root, without the /ssh prefix.
  function getDockerBase(): string {
    return c.rootBase().replace(/\/$/, "");
  }

  function dockerApi(): AxiosInstance {
    return c.createHttp(getDockerBase(), "DOCKER");
  }

  /** Establish (or reuse) an SSH session for Docker operations on a host. */
  async function dockerConnect(
    sessionId: string,
    hostId: number,
    overrides?: SessionAuthOverrides,
  ): Promise<any> {
    try {
      const response = await dockerApi().post("/docker/ssh/connect", {
        sessionId,
        hostId,
        userProvidedPassword: overrides?.userProvidedPassword,
        userProvidedSshKey: overrides?.userProvidedSshKey,
        userProvidedKeyPassword: overrides?.userProvidedKeyPassword,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "connect Docker session");
    }
  }

  async function dockerConnectTOTP(
    sessionId: string,
    totpCode: string,
  ): Promise<any> {
    try {
      const response = await dockerApi().post("/docker/ssh/connect-totp", {
        sessionId,
        totpCode,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "submit Docker TOTP");
    }
  }

  /** Continues a browser sign-in (Warpgate and the like) for a Docker session. */
  async function dockerConnectBrowserSignIn(
    sessionId: string,
    warpgateUrl?: string,
    securityKey?: string,
  ): Promise<any> {
    try {
      const response = await dockerApi().post("/docker/ssh/connect-warpgate", {
        sessionId,
        warpgateUrl,
        securityKey,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "continue Docker sign-in");
    }
  }

  async function dockerKeepAlive(sessionId: string): Promise<void> {
    try {
      await dockerApi().post("/docker/ssh/keepalive", { sessionId });
    } catch {
      // Best-effort heartbeat.
    }
  }

  async function dockerDisconnect(sessionId: string): Promise<void> {
    try {
      await dockerApi().post("/docker/ssh/disconnect", { sessionId });
    } catch {
      // Best-effort on teardown.
    }
  }

  async function dockerStatus(
    sessionId: string,
  ): Promise<{ connected: boolean }> {
    try {
      const response = await dockerApi().get("/docker/ssh/status", {
        params: { sessionId },
      });
      return response.data || { connected: false };
    } catch {
      return { connected: false };
    }
  }

  /** Whether Docker is actually available on the connected host. */
  async function dockerValidate(
    sessionId: string,
  ): Promise<{ available: boolean; version?: string; error?: string }> {
    try {
      const response = await dockerApi().get(`/docker/validate/${sessionId}`);
      return response.data;
    } catch (error) {
      c.fail(error, "validate Docker");
    }
  }

  async function getDockerContainers(
    sessionId: string,
    all = true,
  ): Promise<DockerContainer[]> {
    try {
      const response = await dockerApi().get(
        `/docker/containers/${sessionId}`,
        {
          params: { all },
        },
      );
      const data = response.data;
      return Array.isArray(data) ? data : (data?.containers ?? []);
    } catch (error) {
      c.fail(error, "list Docker containers");
    }
  }

  async function getDockerContainerDetail(
    sessionId: string,
    containerId: string,
  ): Promise<any> {
    try {
      const response = await dockerApi().get(
        `/docker/containers/${sessionId}/${containerId}`,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "inspect Docker container");
    }
  }

  async function getDockerContainerStats(
    sessionId: string,
    containerId: string,
  ): Promise<DockerContainerStats> {
    try {
      const response = await dockerApi().get(
        `/docker/containers/${sessionId}/${containerId}/stats`,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "fetch Docker stats");
    }
  }

  async function dockerContainerAction(
    sessionId: string,
    containerId: string,
    action: DockerActionType,
  ): Promise<void> {
    try {
      if (action === "remove") {
        await dockerApi().delete(
          `/docker/containers/${sessionId}/${containerId}`,
        );
      } else {
        await dockerApi().post(
          `/docker/containers/${sessionId}/${containerId}/${action}`,
        );
      }
    } catch (error) {
      c.fail(error, `docker ${action}`);
    }
  }

  async function getDockerContainerLogs(
    sessionId: string,
    containerId: string,
    tail = 200,
  ): Promise<string> {
    try {
      const response = await dockerApi().get(
        `/docker/containers/${sessionId}/${containerId}/logs`,
        { params: { tail } },
      );
      const data = response.data;
      if (typeof data === "string") return data;
      return data?.logs ?? "";
    } catch (error) {
      c.fail(error, "fetch Docker logs");
    }
  }

  /** The admin switch for stack management. Off when the server can't say. */
  async function getDockerStacksEnabled(): Promise<boolean> {
    try {
      const response = await dockerApi().get(`/docker/stacks-status`);
      return response.data?.enabled === true;
    } catch {
      return false;
    }
  }

  /** Compose stacks on the session's host. 403 when stacks are off on the server. */
  async function getDockerStacks(sessionId: string): Promise<{
    root: string;
    stacks: DockerStackSummary[];
  }> {
    try {
      const response = await dockerApi().get(`/docker/stacks/${sessionId}`);
      return response.data;
    } catch (error) {
      c.fail(error, "list Docker stacks");
    }
  }

  async function getDockerStack(
    sessionId: string,
    name: string,
  ): Promise<DockerStackDetail> {
    try {
      const response = await dockerApi().get(
        `/docker/stacks/${sessionId}/${encodeURIComponent(name)}`,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "load the Docker stack");
    }
  }

  /** Container counts for every Docker host the user can see, cached a minute. */
  async function getDockerSummary(): Promise<DockerHostSummary[]> {
    try {
      const response = await dockerApi().get(`/docker/summary`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      c.fail(error, "load Docker counts");
    }
  }

  return {
    getDockerStacksEnabled,
    getDockerStacks,
    getDockerStack,
    getDockerSummary,
    dockerConnect,
    dockerConnectTOTP,
    dockerConnectBrowserSignIn,
    dockerKeepAlive,
    dockerDisconnect,
    dockerStatus,
    dockerValidate,
    getDockerContainers,
    getDockerContainerDetail,
    getDockerContainerStats,
    dockerContainerAction,
    getDockerContainerLogs,
  };
}

export type DockerApi = ReturnType<typeof createDockerApi>;

export interface DockerStackSummary {
  name: string;
  managed: boolean;
  state: "running" | "partial" | "stopped" | "paused" | "not-deployed";
  running: number;
  total: number;
  composeFile: string | null;
}

export interface DockerStackDetail {
  name: string;
  managed: boolean;
  composeFile: string | null;
  compose: string | null;
  services: {
    service: string;
    name: string;
    id: string;
    image: string;
    state: string;
    status: string;
    health: string;
    ports: string;
  }[];
  running: number;
  total: number;
}

export interface DockerHostSummary {
  hostId: number;
  running: number;
  stopped: number;
  unhealthy: number;
  total: number;
  error?: string;
}
