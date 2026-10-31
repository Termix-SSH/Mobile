import {
  checkNeeds,
  originInputs,
  planConnection,
  planFor,
  type ConnectionOrigin,
  type ConnectionPlan,
  type NeedsResult,
} from "@/core/transport";
import { accounts } from "@/core/accounts";
import { features } from "./registry";

export interface OpenCheck extends NeedsResult {
  plan: ConnectionPlan;
}

/**
 * How a tab of `type` would connect this host, narrowed to what the tab
 * needs. `blocked` says why it can't and which origin would work.
 */
export async function checkOpen(
  accountId: string | null,
  host: { id: number; connectFrom?: string },
  isSsh: boolean,
  type: string,
  origin?: ConnectionOrigin,
): Promise<OpenCheck> {
  const deviceOk = isSsh || !!features.sessionTab(type)?.dialsDirectly;
  const plan = await planFor(accountId, host, deviceOk, origin);
  const inputs = originInputs(accountId, deviceOk);
  const title = features.sessionFeature(type)?.title ?? "This";
  const relayRequires = features.sessionTab(type)?.relayRequires;
  const client =
    relayRequires && inputs.accountKind === "server"
      ? accounts.client(accountId ?? accounts.active().id)
      : null;
  const relayOk = relayRequires ? !!client?.supports(relayRequires) : true;
  const result = checkNeeds(
    features.sessionNeeds(type),
    plan,
    title,
    (o) => planConnection(o, inputs),
    { relayOk },
  );
  return { ...result, plan };
}

/**
 * Keeps only the ways where the phone dials the host itself, for Telnet in
 * the terminal. The server opens Telnet in its own view instead.
 */
export function deviceDialOnly(check: OpenCheck): OpenCheck {
  const attempts = check.attempts.filter((t) => t.provides.includes("tcp"));
  if (attempts.length || check.blocked) return { ...check, attempts };
  return {
    ...check,
    attempts,
    blocked: {
      reason: "Telnet in the terminal needs a connection from the phone.",
      fix: "device",
    },
  };
}
