import { useCallback, useState } from "react";
import { View } from "react-native";
import { Server } from "lucide-react-native";
import { accounts, accountLabel, useClient } from "@/core/accounts";
import { useRepositories } from "@/core/data/hooks";
import { usePoll } from "@/core/exec";
import type { HomeCardProps } from "@/core/features/types";
import { HomeCard, Stat } from "../HomeCard";
import { useHomeData } from "../HomeData";

interface Overview {
  version: string | null;
  update: boolean;
  uptime: string | null;
  database: "healthy" | "error" | null;
  logins: number | null;
}

const POLL_MS = 60_000;

/** Server version, uptime and health, with host and login counts. */
export function ServerCard({ accountId, active, refreshKey }: HomeCardProps) {
  const client = useClient(accountId);
  const repos = useRepositories();
  const { hosts, statuses } = useHomeData();
  const [data, setData] = useState<Overview | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    const [version, uptime, health, logins] = await Promise.allSettled([
      client.api.server.getVersionInfo(),
      client.api.homepage.getUptime(),
      client.api.server.getDatabaseHealth(),
      repos.credentials.list(),
    ]);
    const info = version.status === "fulfilled" ? version.value : null;
    const db = health.status === "fulfilled" ? health.value : null;
    setData({
      version: info?.localVersion ?? null,
      update: info?.status === "requires_update",
      uptime: uptime.status === "fulfilled" ? uptime.value.formatted : null,
      database:
        health.status === "rejected"
          ? "error"
          : db?.status === "ok" || db?.status === "healthy"
            ? "healthy"
            : db
              ? "error"
              : null,
      logins:
        logins.status === "fulfilled" && Array.isArray(logins.value)
          ? logins.value.length
          : null,
    });
  }, [client, repos]);

  usePoll(load, {
    intervalMs: POLL_MS,
    enabled: active,
    restartKey: refreshKey,
  });

  if (!client) return null;
  const states = hosts.map((h) => statuses[h.id]);
  const online = states.filter((s) => s === "online").length;
  const offline = states.filter((s) => s === "offline").length;
  const account = accounts.find(accountId);

  return (
    <HomeCard
      title={account ? accountLabel(account) : "Server"}
      icon={Server}
      meta={data?.update ? "Update available" : undefined}
      loading={!data}
      padded
    >
      <View className="gap-3">
        <View className="flex-row flex-wrap gap-3">
          <Stat label="Version" value={data?.version ?? "-"} />
          <Stat label="Uptime" value={data?.uptime ?? "-"} />
          <Stat
            label="Database"
            value={
              data?.database === "healthy"
                ? "Healthy"
                : data?.database === "error"
                  ? "Error"
                  : "-"
            }
            tone={
              data?.database === "healthy"
                ? "good"
                : data?.database === "error"
                  ? "bad"
                  : undefined
            }
          />
        </View>
        <View className="flex-row flex-wrap gap-3">
          <Stat label="Hosts" value={String(hosts.length)} />
          <Stat
            label="Online"
            value={String(online)}
            tone={online > 0 ? "good" : undefined}
          />
          <Stat
            label="Offline"
            value={String(offline)}
            tone={offline > 0 ? "bad" : undefined}
          />
        </View>
        {data?.logins != null ? (
          <View className="flex-row flex-wrap gap-3">
            <Stat label="Logins" value={String(data.logins)} />
          </View>
        ) : null}
      </View>
    </HomeCard>
  );
}
