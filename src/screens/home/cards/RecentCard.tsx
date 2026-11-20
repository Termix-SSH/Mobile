import { View } from "react-native";
import { Clock } from "lucide-react-native";
import { useRecentHosts } from "@/core/hosts/recent";
import type { HomeCardProps } from "@/core/features/types";
import { ListRow, Text } from "@/ui";
import { Dot, HomeCard } from "../HomeCard";
import { useHomeData } from "../HomeData";
import { t } from "@/i18n";

const SHOWN = 5;

/** Hosts opened lately that aren't pinned. */
export function RecentCard({ accountId }: HomeCardProps) {
  const { hosts, statuses, openHost, showHostMenu } = useHomeData();
  const recent = useRecentHosts(accountId, hosts)
    .filter((h) => !h.pin)
    .slice(0, SHOWN);
  if (recent.length === 0) return null;

  return (
    <HomeCard title={t("home.cards.recentCard.recent")} icon={Clock}>
      <View>
        {recent.map((host, index) => (
          <ListRow
            key={host.id}
            index={index}
            title={host.name || host.ip}
            icon={<Dot state={statuses[host.id] ?? "unknown"} />}
            meta={
              <Text className="text-meta text-muted-foreground">
                {host.username ? `${host.username}@` : ""}
                {host.ip}
              </Text>
            }
            onPress={() => openHost(host)}
            onLongPress={() => showHostMenu(host)}
          />
        ))}
      </View>
    </HomeCard>
  );
}
