import axios from "axios";
import type { AccountClient } from "../AccountClient";
import { ApiError } from "../errors";
import {
  buildPluginHostSettings,
  flattenPluginSettings,
} from "../compat/api-compat";
import type { SSHHost, SSHHostData } from "@/types/index";
import type { HostBulkUpdate } from "@/core/data/types";

export function createHostsApi(c: AccountClient) {
  function normalizeJumpHosts(value: unknown): { hostId: number }[] {
    const raw =
      typeof value === "string"
        ? (() => {
            try {
              return JSON.parse(value);
            } catch {
              return [];
            }
          })()
        : value;

    if (!Array.isArray(raw)) return [];

    return raw
      .map((item) => {
        const hostId = Number((item as { hostId?: unknown })?.hostId);
        return Number.isFinite(hostId) ? { hostId } : null;
      })
      .filter((item): item is { hostId: number } => item !== null);
  }

  function normalizeSSHHost(host: SSHHost): SSHHost {
    const flat = flattenPluginSettings(host as SSHHost & Record<string, any>);
    let sshOptions: unknown = (host as { sshOptions?: unknown }).sshOptions;
    if (typeof sshOptions === "string") {
      try {
        sshOptions = JSON.parse(sshOptions);
      } catch {
        sshOptions = undefined;
      }
    }
    const parent = Number((host as { parentHostId?: unknown }).parentHostId);
    return {
      ...flat,
      parentHostId: Number.isInteger(parent) && parent > 0 ? parent : null,
      sshOptions:
        sshOptions && typeof sshOptions === "object"
          ? (sshOptions as Record<string, unknown>)
          : undefined,
      jumpHosts: normalizeJumpHosts(
        (host as { jumpHosts?: unknown }).jumpHosts,
      ),
    };
  }

  /**
   * 2.9 keeps per host feature switches in plugin settings, not on the host
   * row, so a host save has to write them separately.
   */
  async function writePluginHostSettings(
    hostId: number,
    hostData: SSHHostData,
  ): Promise<void> {
    if (c.apiGeneration !== "plugin" || !Number.isFinite(hostId)) return;

    // Only send what changed, so untouched keys keep following host defaults.
    let current: Record<string, Record<string, unknown>> = {};
    try {
      const response = await c.http.host.get(`/db/host/${hostId}`);
      current = response.data?.pluginSettings ?? {};
    } catch {}
    const same = (a: unknown, b: unknown) => {
      const parse = (v: unknown) => {
        if (typeof v !== "string") return v;
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      };
      return (
        JSON.stringify(parse(a) ?? null) === JSON.stringify(parse(b) ?? null)
      );
    };

    // Plugin 1.2.0+ keeps tunnels in its own table, written below.
    const savedTunnels = c.supportsSavedTunnels();
    const entries = Object.entries(
      buildPluginHostSettings(hostData as Record<string, any>, {
        savedTunnels,
      }),
    )
      .filter(([pluginId]) => c.isPluginEnabled(pluginId))
      .map(([pluginId, values]): [string, Record<string, unknown>] => {
        const existing = current[pluginId];
        if (!existing) return [pluginId, values];
        const changed: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(values)) {
          if (!same(existing[key], value)) changed[key] = value;
        }
        return [pluginId, changed];
      })
      .filter(([, values]) => Object.keys(values).length > 0);

    const results = await Promise.allSettled(
      entries.map(([pluginId, values]) =>
        c.http.auth.put(`/plugins/${pluginId}/settings/host/${hostId}`, values),
      ),
    );

    const failures: string[] = [];
    if (savedTunnels && Array.isArray(hostData.tunnelConnections)) {
      try {
        await c.api.tunnels.putSavedTunnels(hostId, hostData.tunnelConnections);
      } catch (err) {
        failures.push(`tunnels: ${(err as Error)?.message}`);
      }
    }
    results.forEach((result, i) => {
      if (result.status !== "rejected") return;
      const err = result.reason;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // Missing or disabled plugin: nothing to save for it.
      if (status === 404 || status === 503) return;
      const data = axios.isAxiosError(err) ? (err.response?.data as any) : null;
      const detail = data?.errors
        ? Object.values(data.errors).join(", ")
        : data?.error || (err as Error)?.message;
      failures.push(`${entries[i][0]}: ${detail}`);
    });

    if (failures.length > 0) {
      throw new ApiError(
        `Host saved, but some settings failed: ${failures.join("; ")}`,
        400,
        "PLUGIN_SETTINGS_FAILED",
      );
    }
  }

  async function finishHostSave(
    saved: SSHHost,
    hostData: SSHHostData,
    fallbackId?: number,
  ): Promise<SSHHost> {
    if (c.apiGeneration !== "plugin") return saved;
    const hostId = Number(saved?.id ?? fallbackId);
    await writePluginHostSettings(hostId, hostData);
    try {
      const response = await c.http.host.get(`/db/host/${hostId}`);
      return normalizeSSHHost(response.data);
    } catch {
      return saved;
    }
  }

  function normalizeSSHHostResponse(data: unknown): SSHHost[] | null {
    const hosts = Array.isArray(data)
      ? data
      : Array.isArray((data as { hosts?: unknown } | null)?.hosts)
        ? (data as { hosts: SSHHost[] }).hosts
        : null;

    return hosts?.map(normalizeSSHHost) ?? null;
  }

  async function getSSHHosts(): Promise<SSHHost[]> {
    let lastError: unknown;

    for (const baseURL of c.hostBaseCandidates()) {
      const candidateApi = c.createHttp(baseURL, "SSH_HOST");

      try {
        const response = await candidateApi.get("/db/host", {
          headers: { "Cache-Control": "no-cache" },
        });
        const hosts = normalizeSSHHostResponse(response.data);
        if (hosts) {
          c.http.host = candidateApi;
          return hosts;
        }
        lastError = new Error(`Unexpected host response from ${baseURL}`);
      } catch (error) {
        lastError = error;
        if (
          axios.isAxiosError(error) &&
          [401, 403].includes(error.response?.status ?? 0)
        )
          break;
      }
    }

    c.fail(lastError, "fetch SSH hosts");
  }

  async function createSSHHost(hostData: SSHHostData): Promise<SSHHost> {
    try {
      const submitData = {
        name: hostData.name || "",
        ip: hostData.ip,
        port: parseInt(hostData.port.toString()) || 22,
        username: hostData.username,
        folder: hostData.folder || "",
        // Sent only when set: the server clears the parent when folder comes alone.
        ...(hostData.parentHostId !== undefined
          ? { parentHostId: hostData.parentHostId }
          : {}),
        tags: hostData.tags || [],
        pin: Boolean(hostData.pin),
        authType: hostData.authType,
        password: hostData.authType === "password" ? hostData.password : null,
        key: hostData.authType === "key" ? hostData.key : null,
        keyPassword: hostData.authType === "key" ? hostData.keyPassword : null,
        keyType: hostData.authType === "key" ? hostData.keyType : null,
        credentialId:
          hostData.authType === "credential" ? hostData.credentialId : null,
        overrideCredentialUsername: Boolean(
          hostData.overrideCredentialUsername,
        ),
        enableTerminal: Boolean(hostData.enableTerminal),
        enableTunnel: Boolean(hostData.enableTunnel),
        enableFileManager: Boolean(hostData.enableFileManager),
        defaultPath: hostData.defaultPath || "/",
        tunnelConnections: hostData.tunnelConnections || [],
        jumpHosts: hostData.jumpHosts || [],
        quickActions: hostData.quickActions || [],
        statsConfig: hostData.statsConfig
          ? typeof hostData.statsConfig === "string"
            ? hostData.statsConfig
            : JSON.stringify(hostData.statsConfig)
          : null,
        terminalConfig: hostData.terminalConfig || null,
        ...(hostData.sudoPassword !== undefined
          ? { sudoPassword: hostData.sudoPassword || null }
          : {}),
        ...(hostData.sshOptions !== undefined
          ? { sshOptions: hostData.sshOptions }
          : {}),
        forceKeyboardInteractive: Boolean(hostData.forceKeyboardInteractive),
        ...buildProtocolFields(hostData),
      };

      if (!submitData.enableTunnel) {
        submitData.tunnelConnections = [];
      }

      if (!submitData.enableFileManager) {
        submitData.defaultPath = "";
      }

      if (hostData.authType === "key" && hostData.key instanceof File) {
        const formData = new FormData();
        formData.append("key", hostData.key);

        const dataWithoutFile = { ...submitData };
        delete dataWithoutFile.key;
        formData.append("data", JSON.stringify(dataWithoutFile));

        const response = await c.http.host.post("/db/host", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        return await finishHostSave(response.data, hostData);
      } else {
        const response = await c.http.host.post("/db/host", submitData);
        return await finishHostSave(response.data, hostData);
      }
    } catch (error) {
      c.fail(error, "create SSH host");
    }
  }

  /**
   * Modern multi-protocol fields shared by create/update. Only included when the
   * caller provides them so legacy SSH-only payloads are unchanged. SSH defaults
   * to enabled when no protocol flags are specified.
   */
  function buildProtocolFields(hostData: SSHHostData): Record<string, unknown> {
    const anyProtocol =
      hostData.enableSsh !== undefined ||
      hostData.enableRdp ||
      hostData.enableVnc ||
      hostData.enableTelnet;
    return {
      enableSsh: anyProtocol ? Boolean(hostData.enableSsh) : true,
      enableRdp: Boolean(hostData.enableRdp),
      enableVnc: Boolean(hostData.enableVnc),
      enableTelnet: Boolean(hostData.enableTelnet),
      enableDocker: Boolean(hostData.enableDocker),
      notes: hostData.notes ?? "",
      macAddress: hostData.macAddress?.trim() || null,
      rdpUser: hostData.enableRdp ? (hostData.rdpUser ?? null) : null,
      rdpPassword: hostData.enableRdp ? (hostData.rdpPassword ?? null) : null,
      rdpDomain: hostData.enableRdp ? (hostData.rdpDomain ?? null) : null,
      rdpPort: hostData.enableRdp ? (hostData.rdpPort ?? null) : null,
      vncUser: hostData.enableVnc ? (hostData.vncUser ?? null) : null,
      vncPassword: hostData.enableVnc ? (hostData.vncPassword ?? null) : null,
      vncPort: hostData.enableVnc ? (hostData.vncPort ?? null) : null,
      telnetUser: hostData.enableTelnet ? (hostData.telnetUser ?? null) : null,
      telnetPassword: hostData.enableTelnet
        ? (hostData.telnetPassword ?? null)
        : null,
      telnetPort: hostData.enableTelnet ? (hostData.telnetPort ?? null) : null,
    };
  }

  async function updateSSHHost(
    hostId: number,
    hostData: SSHHostData,
  ): Promise<SSHHost> {
    try {
      const submitData = {
        name: hostData.name || "",
        ip: hostData.ip,
        port: parseInt(hostData.port.toString()) || 22,
        username: hostData.username,
        folder: hostData.folder || "",
        // Sent only when set: the server clears the parent when folder comes alone.
        ...(hostData.parentHostId !== undefined
          ? { parentHostId: hostData.parentHostId }
          : {}),
        tags: hostData.tags || [],
        pin: Boolean(hostData.pin),
        authType: hostData.authType,
        password: hostData.authType === "password" ? hostData.password : null,
        key: hostData.authType === "key" ? hostData.key : null,
        keyPassword: hostData.authType === "key" ? hostData.keyPassword : null,
        keyType: hostData.authType === "key" ? hostData.keyType : null,
        credentialId:
          hostData.authType === "credential" ? hostData.credentialId : null,
        overrideCredentialUsername: Boolean(
          hostData.overrideCredentialUsername,
        ),
        enableTerminal: Boolean(hostData.enableTerminal),
        enableTunnel: Boolean(hostData.enableTunnel),
        enableFileManager: Boolean(hostData.enableFileManager),
        defaultPath: hostData.defaultPath || "/",
        tunnelConnections: hostData.tunnelConnections || [],
        jumpHosts: hostData.jumpHosts || [],
        quickActions: hostData.quickActions || [],
        statsConfig: hostData.statsConfig
          ? typeof hostData.statsConfig === "string"
            ? hostData.statsConfig
            : JSON.stringify(hostData.statsConfig)
          : null,
        terminalConfig: hostData.terminalConfig || null,
        ...(hostData.sudoPassword !== undefined
          ? { sudoPassword: hostData.sudoPassword || null }
          : {}),
        ...(hostData.sshOptions !== undefined
          ? { sshOptions: hostData.sshOptions }
          : {}),
        forceKeyboardInteractive: Boolean(hostData.forceKeyboardInteractive),
        ...buildProtocolFields(hostData),
      };

      if (!submitData.enableTunnel) {
        submitData.tunnelConnections = [];
      }
      if (!submitData.enableFileManager) {
        submitData.defaultPath = "";
      }

      if (hostData.authType === "key" && hostData.key instanceof File) {
        const formData = new FormData();
        formData.append("key", hostData.key);

        const dataWithoutFile = { ...submitData };
        delete dataWithoutFile.key;
        formData.append("data", JSON.stringify(dataWithoutFile));

        const response = await c.http.host.put(`/db/host/${hostId}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        return await finishHostSave(response.data, hostData, hostId);
      } else {
        const response = await c.http.host.put(
          `/db/host/${hostId}`,
          submitData,
        );
        return await finishHostSave(response.data, hostData, hostId);
      }
    } catch (error) {
      c.fail(error, "update SSH host");
    }
  }

  async function bulkImportSSHHosts(hosts: SSHHostData[]): Promise<{
    message: string;
    success: number;
    failed: number;
    errors: string[];
  }> {
    try {
      const response = await c.http.host.post("/bulk-import", { hosts });
      return response.data;
    } catch (error) {
      c.fail(error, "bulk import SSH hosts");
    }
  }

  async function reorderHosts(
    positions: { id: number; sortOrder: number }[],
  ): Promise<void> {
    try {
      await c.http.host.put("/reorder", { positions });
    } catch (error) {
      c.fail(error, "reorder hosts");
    }
  }

  async function bulkUpdateHosts(
    hostIds: number[],
    updates: HostBulkUpdate,
  ): Promise<void> {
    try {
      await c.http.host.patch("/bulk-update", { hostIds, updates });
    } catch (error) {
      c.fail(error, "update hosts");
    }
  }

  async function deleteSSHHost(hostId: number): Promise<any> {
    try {
      const response = await c.http.host.delete(`/db/host/${hostId}`);
      return response.data;
    } catch (error) {
      c.fail(error, "delete SSH host");
    }
  }

  async function getSSHHostById(hostId: number): Promise<SSHHost> {
    try {
      const response = await c.http.host.get(`/db/host/${hostId}`);
      return normalizeSSHHost(response.data);
    } catch (error) {
      c.fail(error, "fetch SSH host");
    }
  }

  async function exportSSHHostWithCredentials(
    hostId: number,
  ): Promise<SSHHost> {
    try {
      const response = await c.http.host.get(`/db/host/${hostId}/export`);
      return response.data;
    } catch (error) {
      c.fail(error, "export SSH host with credentials");
    }
  }

  /**
   * Saves where the mobile app connects this host from. False when the server
   * can't keep it: an older ssh-terminal plugin, or no edit access.
   */
  async function setConnectFrom(
    hostId: number,
    connectFrom: string,
  ): Promise<boolean> {
    if (c.apiGeneration !== "plugin" || !c.isPluginEnabled("ssh-terminal")) {
      return false;
    }
    try {
      await c.http.auth.put(`/plugins/ssh-terminal/settings/host/${hostId}`, {
        connectFrom,
      });
      return true;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status && [400, 403, 404, 503].includes(status)) return false;
      throw err;
    }
  }

  return {
    normalizeSSHHost,
    setConnectFrom,
    getSSHHosts,
    createSSHHost,
    updateSSHHost,
    bulkImportSSHHosts,
    reorderHosts,
    bulkUpdateHosts,
    deleteSSHHost,
    getSSHHostById,
    exportSSHHostWithCredentials,
  };
}

export type HostsApi = ReturnType<typeof createHostsApi>;
