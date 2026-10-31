import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { Container } from "lucide-react-native";
import type { ContainerCounts } from "@termix-ssh/plugin-sdk/host-scripts";
import { useClient } from "@/core/accounts";
import { useCardTarget, usePoll } from "@/core/exec";
import type { DashboardCardProps } from "@/core/features/types";
import { CardFrame } from "@/screens/home/CardFrame";
import { Text } from "@/ui";
import { createLocalDockerBackend } from "./backend/local";

const errorText = (e: unknown) =>
  e instanceof Error && e.message ? e.message : "Docker did not answer";

/** Running, stopped and unhealthy containers on a pinned host. */
export function DockerCard({ host, accountId, active }: DashboardCardProps) {
  const target = useCardTarget(host, accountId, "docker", active);
  const client = useClient(accountId);
  const [counts, setCounts] = useState<ContainerCounts | null>(null);
  const [error, setError] = useState("");
  const local = useMemo(
    () =>
      target.phase === "local"
        ? createLocalDockerBackend(target.runner, {
            prefer:
              host.pluginSettings?.docker?.containerRuntime === "podman"
                ? "podman"
                : "docker",
          })
        : null,
    [target, host],
  );

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        if (local) {
          setCounts(await local.counts(signal));
        } else if (target.phase === "relay" && client) {
          // The server caches this a minute and checks a few hosts at a time.
          const all = await client.api.docker.getDockerSummary();
          const mine = all.find((s) => s.hostId === target.host.id);
          if (mine?.error) throw new Error(mine.error);
          setCounts(mine ?? null);
        } else return;
        setError("");
      } catch (e) {
        if (!signal.aborted) setError(errorText(e));
      }
    },
    [local, target, client],
  );
  usePoll(load, {
    intervalMs: 30_000,
    enabled: active && (target.phase === "local" || target.phase === "relay"),
  });

  return (
    <CardFrame
      title="Docker"
      icon={Container}
      target={target}
      error={error}
      loading={!counts && !error}
    >
      {counts ? (
        <View className="flex-row gap-4">
          <Count value={counts.running} label="running" />
          <Count value={counts.stopped} label="stopped" />
          {counts.unhealthy ? (
            <Count value={counts.unhealthy} label="unhealthy" warn />
          ) : null}
        </View>
      ) : (
        <Text className="text-[11px] text-muted-foreground">No containers</Text>
      )}
    </CardFrame>
  );
}

function Count({
  value,
  label,
  warn,
}: {
  value: number;
  label: string;
  warn?: boolean;
}) {
  return (
    <View>
      <Text
        weight="bold"
        className={`text-lg ${warn ? "text-destructive-text" : "text-foreground"}`}
      >
        {value}
      </Text>
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
    </View>
  );
}
