import { useCallback, useState } from "react";
import { View } from "react-native";
import { ChevronRight, Network } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { useClient } from "@/core/accounts";
import { usePoll } from "@/core/exec";
import type { HomeCardProps } from "@/core/features/types";
import { Dot, HomeCard } from "@/screens/home/HomeCard";
import { useHomeData } from "@/screens/home/HomeData";
import type { SSHHost, TunnelStatus } from "@/types";
import { isSshHost } from "@/utils/hosts";
import { ListRow, Text } from "@/ui";

const SHOWN = 5;
const POLL_MS = 30_000;

export const hasTunnels = (host: SSHHost) =>
  isSshHost(host) &&
  !!host.enableTunnel &&
  (host.tunnelConnections?.length ?? 0) > 0;

/** Hosts with saved tunnels; a tap opens their tunnels tab. */
export function TunnelsCard({ accountId, active, refreshKey }: HomeCardProps) {
  const client = useClient(accountId);
  const color = useThemeColor();
  const { navigateToSessions } = useTerminalSessions();
  const { hosts, statuses } = useHomeData();
  const [server, setServer] = useState<Record<string, TunnelStatus> | null>(
    null,
  );
  const withTunnels = hosts.filter(hasTunnels).slice(0, SHOWN);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setServer(await client.api.tunnels.getTunnelStatuses());
    } catch {
      setServer(null);
    }
  }, [client]);

  usePoll(load, {
    intervalMs: POLL_MS,
    enabled: active && !!client && withTunnels.length > 0,
    restartKey: refreshKey,
  });

  if (withTunnels.length === 0) return null;
  const connected = server
    ? Object.values(server).filter((s) => s.connected).length
    : null;
  const muted = color("muted-foreground");

  return (
    <HomeCard
      title="Tunnels"
      icon={Network}
      meta={connected != null ? `${connected} running on server` : undefined}
    >
      <View>
        {withTunnels.map((host, index) => {
          const count = host.tunnelConnections?.length ?? 0;
          return (
            <ListRow
              key={host.id}
              index={index}
              title={host.name || host.ip}
              icon={<Dot state={statuses[host.id] ?? "unknown"} />}
              meta={
                <Text className="text-meta text-muted-foreground">
                  {count === 1 ? "1 tunnel" : `${count} tunnels`}
                </Text>
              }
              trailing={<ChevronRight size={16} color={muted} />}
              onPress={() => void navigateToSessions(host, "tunnel")}
            />
          );
        })}
      </View>
    </HomeCard>
  );
}
