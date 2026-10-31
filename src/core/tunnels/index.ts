import { Platform } from "react-native";
import { useSyncExternalStore } from "react";
import { sessionLifecycle } from "@/core/sessions/lifecycle";
import type { AccountClient } from "@/core/api/AccountClient";
import type { DataRepositories } from "@/core/data/types";
import type { SSHHost, TunnelConnection } from "@/types";
import { LocalTunnelRunner } from "./runner";

export * from "./runner";

export const tunnelRunner = new LocalTunnelRunner({ platform: Platform.OS });
sessionLifecycle.register(tunnelRunner);

export function useLocalTunnelStatuses() {
  return useSyncExternalStore(
    tunnelRunner.subscribe,
    tunnelRunner.getSnapshot,
    tunnelRunner.getSnapshot,
  );
}

export type RunOn = "phone" | "server";
export const RUN_ON_PREF = "tunnels.runOn";

/**
 * Where a host's tunnels run. This device always uses the phone. A linked
 * server defaults to its relay and the host can pick the phone.
 */
export async function runOnFor(
  repos: DataRepositories,
  host: SSHHost,
  hasServer: boolean,
): Promise<RunOn> {
  if (!hasServer) return "phone";
  const saved = await repos.hostPrefs.get(host, RUN_ON_PREF).catch(() => null);
  return saved === "phone" ? "phone" : "server";
}

/**
 * A host's tunnels. A server with the saved routes is the source of truth,
 * everything else reads the list on the host.
 */
export async function loadTunnels(
  client: AccountClient | null,
  host: SSHHost,
): Promise<TunnelConnection[]> {
  const own = host.tunnelConnections ?? [];
  if (!client || !client.supportsSavedTunnels()) return own;
  try {
    const saved = await client.api.tunnels.getSavedTunnels();
    if (!saved) return own;
    return saved[Number(host.id)] ?? [];
  } catch {
    return own;
  }
}
