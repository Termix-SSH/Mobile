import { useCallback, useState } from "react";
import { View } from "react-native";
import { Activity, SquareTerminal } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useClient } from "@/core/accounts";
import { features } from "@/core/features";
import { usePoll } from "@/core/exec";
import type { HomeCardProps } from "@/core/features/types";
import type { RecentActivityItem } from "@/types";
import { ListRow, Text } from "@/ui";
import { ago } from "@/utils/ago";
import { HomeCard } from "../HomeCard";
import { useHomeData } from "../HomeData";
import { t } from "@/i18n";

const SHOWN = 6;

/** Activity types whose open-tabs name differs. */
const TAB_TYPE: Record<string, string> = {
  file_manager: "files",
  server_stats: "host-metrics",
};

const tabTypeOf = (activityType: string) =>
  TAB_TYPE[activityType] ?? activityType;

/** Icon and word for an activity, from the tab it opens. */
function describe(activityType: string) {
  if (activityType === "terminal") {
    return {
      icon: SquareTerminal,
      label: t("home.cards.activityCard.terminal"),
    };
  }
  const found = features.sessionTabForServerType(tabTypeOf(activityType));
  if (found) {
    return {
      icon: found.tab.icon,
      label:
        activityType === "file_manager"
          ? t("home.cards.activityCard.files")
          : found.tab.shortLabel(found.opts),
    };
  }
  return {
    icon: SquareTerminal,
    label: activityType.replace(/_/g, " "),
  };
}
const POLL_MS = 60_000;

/** What was opened lately on the server, from any device. */
export function ActivityCard({ accountId, active, refreshKey }: HomeCardProps) {
  const client = useClient(accountId);
  const color = useThemeColor();
  const { hosts, openHostAs } = useHomeData();
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
    <HomeCard
      title={t("home.cards.activityCard.recentActivity")}
      icon={Activity}
    >
      <View>
        {items.map((item, index) => {
          const host = hosts.find(
            (h) => (h.serverId ?? h.id) === item.hostId || h.id === item.hostId,
          );
          const { icon: Icon, label } = describe(item.type);
          return (
            <ListRow
              key={`${item.id}`}
              index={index}
              title={item.hostName}
              icon={<Icon size={16} color={muted} />}
              meta={
                <Text className="text-meta text-muted-foreground">
                  {label}
                  {" | "}
                  {ago(item.timestamp)}
                </Text>
              }
              onPress={
                host ? () => openHostAs(host, tabTypeOf(item.type)) : undefined
              }
            />
          );
        })}
      </View>
    </HomeCard>
  );
}
