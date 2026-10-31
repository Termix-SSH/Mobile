import { useCallback } from "react";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import {
  useHostActions,
  type FeatureContext,
  type HostActionDef,
} from "@/core/features";
import type { SSHHost } from "@/types";

/** What one tap on a host runs: its first connect action, the terminal for SSH hosts. */
export function primaryAction(
  host: SSHHost,
  actions: HostActionDef[],
  ctx: FeatureContext,
): HostActionDef | null {
  return (
    actions.find((a) => a.group === "connect" && a.isAvailable(host, ctx)) ??
    null
  );
}

/**
 * One tap on a host. Resolves to false when the host has nothing to open,
 * so the caller can show the host's sheet instead.
 */
export function useOpenHost(): (host: SSHHost) => Promise<boolean> {
  const { navigateToSessions } = useTerminalSessions();
  const { ctx, actions } = useHostActions();
  return useCallback(
    async (host: SSHHost) => {
      const action = primaryAction(host, actions, ctx);
      if (!action) return false;
      await action.run(host, {
        ...ctx,
        openSession: async (type, opts) => {
          await navigateToSessions(host, type, opts);
        },
        close: () => {},
      });
      return true;
    },
    [actions, ctx, navigateToSessions],
  );
}
