import { useCallback, useState } from "react";
import { accounts } from "@/core/accounts";
import { usePoll } from "@/core/exec";
import { hostStatusesByLocalId } from "@/core/sync";
import type { ServerStatus, SSHHost } from "@/types";
import { useLocalStatuses } from "./useLocalStatuses";

export type HostState = "online" | "offline" | "unknown";

const POLL_MS = 30_000;

/**
 * Online or offline for each host: the server's checks when it runs Host
 * Status, else the phone's own. Polls only while `active`.
 */
export function useHostStatuses(
  accountId: string,
  hosts: SSHHost[],
  { active, refreshKey }: { active: boolean; refreshKey?: unknown },
): Record<number, HostState> {
  const client = accounts.client(accountId);
  const serverChecks = !!client?.supports({ plugin: "host-status" });
  const [server, setServer] = useState<Record<number, ServerStatus>>({});
  const phone = useLocalStatuses(hosts, active && !serverChecks);

  const poll = useCallback(async () => {
    if (!serverChecks || hosts.length === 0) return;
    const next = await hostStatusesByLocalId<ServerStatus>(accountId, hosts);
    setServer(next ?? {});
  }, [accountId, hosts, serverChecks]);

  usePoll(poll, {
    intervalMs: POLL_MS,
    enabled: active && serverChecks,
    // A new host list asks again now instead of waiting for the next tick.
    restartKey: `${String(refreshKey)}:${hosts.length}`,
  });

  const out: Record<number, HostState> = {};
  for (const host of hosts) {
    out[host.id] = server[host.id]?.status ?? phone[host.id] ?? "unknown";
  }
  return out;
}
