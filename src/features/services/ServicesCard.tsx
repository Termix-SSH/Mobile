import { useCallback, useMemo, useState } from "react";
import { Cog } from "lucide-react-native";
import { useClient } from "@/core/accounts";
import { useCardTarget, usePoll } from "@/core/exec";
import type { DashboardCardProps } from "@/core/features/types";
import { CardFrame } from "@/screens/home/CardFrame";
import { Text } from "@/ui";
import { createLocalServicesBackend } from "./backend/local";
import { createRelayServicesBackend } from "./backend/relay";
import type { HostServices } from "./backend/types";

/** Failed services on a pinned host. */
export function ServicesCard({ host, accountId, active }: DashboardCardProps) {
  const target = useCardTarget(host, accountId, "services", active);
  const client = useClient(accountId);
  const [status, setStatus] = useState<HostServices | null>(null);
  const [error, setError] = useState("");
  const backend = useMemo(() => {
    if (target.phase === "local")
      return createLocalServicesBackend(target.runner);
    if (target.phase === "relay" && client) {
      return createRelayServicesBackend(client, target.host);
    }
    return null;
  }, [target, client]);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!backend) return;
      try {
        setStatus(await backend.status(signal));
        setError("");
      } catch (e) {
        if (!signal.aborted) {
          setError(
            e instanceof Error && e.message
              ? e.message
              : "Could not read services",
          );
        }
      }
    },
    [backend],
  );
  usePoll(load, { intervalMs: 60_000, enabled: active && !!backend });

  return (
    <CardFrame
      title="Services"
      icon={Cog}
      target={target}
      error={error}
      loading={!status && !error}
    >
      {status ? (
        status.init === "none" ? (
          <Text className="text-[11px] text-muted-foreground">
            No systemd or OpenRC
          </Text>
        ) : status.failed > 0 ? (
          <Text weight="bold" className="text-sm text-destructive-text">
            {status.failed} failed
          </Text>
        ) : (
          <Text className="text-sm text-foreground">All running</Text>
        )
      ) : null}
    </CardFrame>
  );
}
