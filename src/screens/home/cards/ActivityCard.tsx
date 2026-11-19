import { useCallback, useState } from "react";
import { View } from "react-native";
import { Activity, Folder, SquareTerminal } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useClient } from "@/core/accounts";
import { usePoll } from "@/core/exec";
import type { HomeCardProps } from "@/core/features/types";
import type { RecentActivityItem } from "@/types";
import { ListRow, Text } from "@/ui";
import { ago } from "@/utils/ago";
import { HomeCard } from "../HomeCard";
import { useHomeData } from "../HomeData";

const SHOWN = 6;
const POLL_MS = 60_000;

/** What was opened lately on the server, from any device. */
export function ActivityCard({ accountId, active, refreshKey }: HomeCardProps) {
  const client = useClient(accountId);
  const color = useThemeColor();
  const { hosts, openHost } = useHomeData();
  const [items, setItems] = useState<RecentActivityItem[] | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const list = await client.api.homepage.getRecentActivity(SHOWN);
      setItems(Array.isArray(list) ? list.slice(0, SHOWN) : []);
    } catch {
      // Servers without an activity feed answer 404; the card just stays away.
      setItems([]);
    }
  }, [client]);

  usePoll(load, {
    intervalMs: POLL_MS,
    enabled: active,
    restartKey: refreshKey,
  });

  if (!client || !items || items.length === 0) return null;
  const muted = color("muted-foreground");

  return (
    <HomeCard title="Recent activity" icon={Activity}>
      <View>
        {items.map((item, index) => {
          const host = hosts.find(
            (h) => (h.serverId ?? h.id) === item.hostId || h.id === item.hostId,
          );
          const Icon = item.type === "file_manager" ? Folder : SquareTerminal;
          return (
            <ListRow
              key={`${item.id}`}
              index={index}
              title={item.hostName}
              icon={<Icon size={16} color={muted} />}
              meta={
                <Text className="text-meta text-muted-foreground">
                  {item.type === "file_manager" ? "Files" : "Terminal"}
                  {" | "}
                  {ago(item.timestamp)}
                </Text>
              }
              onPress={host ? () => openHost(host) : undefined}
            />
          );
        })}
      </View>
    </HomeCard>
  );
}
