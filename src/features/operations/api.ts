import type { AccountClient } from "@/core/api/AccountClient";

/** One input of an action, as the server's catalog describes it. */
export interface ActionField {
  key: string;
  type: string;
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: { value: string }[];
  optionLabels?: Record<string, string>;
  requires?: string;
}

export interface Action {
  id: string;
  pluginId: string;
  pluginName: string;
  title: string;
  description?: string;
  scope: "host" | "resource" | "server";
  resource?: string;
  risk: "read" | "change" | "destructive";
  inputs: ActionField[];
  when?: { settings?: Record<string, unknown> };
  surfaces?: Record<string, boolean>;
  available: boolean;
}

export interface Catalog {
  actions: Action[];
  resources: {
    id: string;
    title: string;
    list: string;
    key: string;
    name: string;
  }[];
}

export interface Outcome {
  runId: string | null;
  status: string;
  summary?: string;
  error?: string;
  data?: unknown;
}

export interface Run {
  id: string;
  actionId: string;
  hostName: string | null;
  username: string;
  status: string;
  summary: string | null;
  error: string | null;
  dryRun: boolean;
  createdAt: string;
  input: unknown;
  origin?: { kind: string; via?: string };
}

export interface Approval {
  id: string;
  reason: string | null;
  allowSelf: boolean;
  requestedBy: string | null;
  expiresAt: string;
  run: Run & { risk: string };
}

export async function getCatalog(client: AccountClient): Promise<Catalog> {
  const { data } = await client.http.auth.get<Catalog>("/operations/catalog", {
    params: { surface: "mobile" },
  });
  return data;
}

export async function runAction(
  client: AccountClient,
  actionId: string,
  body: {
    hostId?: number;
    resourceKey?: string;
    input?: Record<string, unknown>;
    dryRun?: boolean;
    confirmed?: boolean;
  },
): Promise<Outcome> {
  const { data } = await client.http.auth.post<Outcome>(
    `/operations/${encodeURIComponent(actionId)}/run`,
    body,
  );
  return data;
}

export async function getTargets(
  client: AccountClient,
  resourceId: string,
  hostId: number,
): Promise<{ key: string; name: string }[] | null> {
  const { data } = await client.http.auth.get<{
    rows: { key: string; row: Record<string, unknown> }[];
    hosts: { state: string }[];
  }>(`/operations/resources/${encodeURIComponent(resourceId)}`, {
    params: { hostIds: String(hostId) },
  });
  if (data.hosts[0]?.state === "loading") return null;
  return data.rows.map((row) => ({
    key: row.key,
    name: String(row.row.name ?? row.key),
  }));
}

export async function listRuns(client: AccountClient): Promise<Run[]> {
  const { data } = await client.http.auth.get<{ runs: Run[] }>(
    "/operations/runs",
    { params: { limit: 50 } },
  );
  return data.runs;
}

export async function listApprovals(
  client: AccountClient,
): Promise<Approval[]> {
  const { data } = await client.http.auth.get<{ approvals: Approval[] }>(
    "/operations/approvals",
  );
  return data.approvals;
}

export async function decide(
  client: AccountClient,
  id: string,
  approve: boolean,
): Promise<Outcome> {
  const { data } = await client.http.auth.post<Outcome>(
    `/operations/approvals/${id}`,
    { approve },
  );
  return data;
}

/** The plugin's own host settings, the same test the server's gate runs. */
export function appliesTo(
  action: Action,
  pluginSettings: Record<string, Record<string, unknown>> | undefined,
): boolean {
  if (action.scope === "server" || !action.available) return false;
  const settings = pluginSettings?.[action.pluginId] ?? {};
  return Object.entries(action.when?.settings ?? {}).every(
    ([key, value]) => (settings[key] ?? false) === value,
  );
}

export function errorText(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data;
  if (typeof data?.error === "string") return data.error;
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Plain words for a run or approval state. */
export const STATE_LABELS: Record<string, string> = {
  success: "Done",
  failed: "Failed",
  running: "Running",
  pending_approval: "Needs approval",
  needs_interaction: "Needs sign in",
  interrupted: "Interrupted",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};
