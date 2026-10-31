import type {
  JournalEntry,
  UnitDetail,
  UnitSummary,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { AccountClient } from "../AccountClient";

/** What the Service Manager plugin says about a host. */
export interface ServicesStatus {
  init: "systemd" | "openrc" | "none";
  version: string;
  os: string;
  hostname: string;
  root: boolean;
  journal: boolean;
  failed: number;
  canEdit: boolean;
  readOnly: boolean;
}

export interface JournalFilter {
  units?: string[];
  priority?: number;
  lines?: number;
}

/** The server's Service Manager plugin, by host id. */
export function createServicesApi(c: AccountClient) {
  const base = (hostId: number) =>
    `/plugin-api/service-manager/${encodeURIComponent(String(hostId))}`;
  const get = async <T>(path: string, params?: Record<string, unknown>) =>
    (
      await c.http.auth.get(path, {
        baseURL: c.rootBase(),
        params,
        // The plugin reads repeated unit= params as a list.
        paramsSerializer: { indexes: null },
      })
    ).data as T;

  async function getServicesStatus(hostId: number): Promise<ServicesStatus> {
    try {
      return await get<ServicesStatus>(`${base(hostId)}/status`);
    } catch (error) {
      c.fail(error, "read services");
    }
  }

  async function getUnits(
    hostId: number,
    type = "service",
  ): Promise<UnitSummary[]> {
    try {
      return await get<UnitSummary[]>(`${base(hostId)}/units`, { type });
    } catch (error) {
      c.fail(error, "list services");
    }
  }

  async function getUnit(hostId: number, unit: string): Promise<UnitDetail> {
    try {
      return await get<UnitDetail>(
        `${base(hostId)}/units/${encodeURIComponent(unit)}`,
      );
    } catch (error) {
      c.fail(error, "read the service");
    }
  }

  async function unitAction(
    hostId: number,
    unit: string,
    action: string,
  ): Promise<{ state: string; output: string }> {
    try {
      const response = await c.http.auth.post(
        `${base(hostId)}/units/${encodeURIComponent(unit)}/actions/${encodeURIComponent(action)}`,
        {},
        { baseURL: c.rootBase() },
      );
      return response.data;
    } catch (error) {
      c.fail(error, `${action} the service`);
    }
  }

  async function getJournal(
    hostId: number,
    filter: JournalFilter,
  ): Promise<{ entries: JournalEntry[]; truncated: boolean }> {
    try {
      return await get(`${base(hostId)}/journal`, {
        unit: filter.units,
        priority: filter.priority,
        lines: filter.lines,
      });
    } catch (error) {
      c.fail(error, "read the journal");
    }
  }

  return { getServicesStatus, getUnits, getUnit, unitAction, getJournal };
}

export type ServicesApi = ReturnType<typeof createServicesApi>;
