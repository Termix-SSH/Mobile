import { Pressable, View } from "react-native";
import { ChevronRight, Pin, Plus, Server } from "lucide-react-native";
import { useAppContext } from "@/contexts/AppContext";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { accounts } from "@/core/accounts";
import { useDashboardCards } from "@/core/features/hooks";
import type { HomeCardProps } from "@/core/features/types";
import { openTab } from "@/screens/shell/navigate";
import type { SSHHost } from "@/types";
import { Button, EmptyState, Text } from "@/ui";
import { isSshHost } from "@/utils/hosts";
import { Dot, HomeCard } from "../HomeCard";
import { useHomeData } from "../HomeData";
import { t } from "@/i18n";

/** Pinned hosts in name order, SSH first since only they have cards. */
export function pinnedHosts(hosts: SSHHost[]): SSHHost[] {
  return hosts
    .filter((h) => h.pin)
    .sort(
      (a, b) =>
        Number(isSshHost(b)) - Number(isSshHost(a)) ||
        (a.name || a.ip).localeCompare(b.name || b.ip),
    );
}

/** Pinned hosts with their live cards, or how to get some. */
export function PinnedCard({ accountId, active }: HomeCardProps) {
  const { hosts, hostsLoading, statuses, openHost, showHostMenu } =
    useHomeData();
  const { openAuthFlow } = useAppContext();
  const color = useThemeColor();
  const pinned = pinnedHosts(hosts);
  const local = accounts.find(accountId)?.kind === "local";

  if (hostsLoading) return null;

  if (hosts.length === 0) {
    return (
      <EmptyState
        icon={Server}
        title={t("home.cards.pinnedCard.addYourFirstHost")}
        hint={t("home.cards.pinnedCard.hostsYouOpenShowUp")}
        action={
          <View className="items-center gap-2">
            <Button
              size="sm"
              onPress={() => openTab("/(tabs)/hosts?action=new")}
              icon={<Plus size={15} color={color("accent-brand")} />}
            >
              {t("home.cards.pinnedCard.addHost")}
            </Button>
            {local ? (
              <Button
                size="sm"
                variant="ghost"
                onPress={() => openAuthFlow("server")}
              >
                {t("home.cards.pinnedCard.linkAServer")}
              </Button>
            ) : null}
          </View>
        }
      />
    );
  }

  if (pinned.length === 0) {
    return (
      <EmptyState
        icon={Pin}
        title={t("home.cards.pinnedCard.pinAHostToSee")}
        hint={t("home.cards.pinnedCard.pinnedHostsShowTheirMetrics")}
        action={
          <Button size="sm" onPress={() => openTab("/(tabs)/hosts")}>
            {t("home.cards.pinnedCard.goToHosts")}
          </Button>
        }
      />
    );
  }

  return (
    <HomeCard
      title={t("home.cards.pinnedCard.pinned")}
      icon={Pin}
      meta={String(pinned.length)}
      padded
    >
      <View className="gap-4">
        {pinned.map((host) => (
          <HostSection
            key={`${accountId}:${host.id}`}
            host={host}
            accountId={accountId}
            active={active}
            state={statuses[host.id] ?? "unknown"}
            onOpen={() => openHost(host)}
            onMore={() => showHostMenu(host)}
            chevron={color("muted-foreground")}
          />
        ))}
      </View>
    </HomeCard>
  );
}

function HostSection({
  host,
  accountId,
  active,
  state,
  onOpen,
  onMore,
  chevron,
}: {
  host: SSHHost;
  accountId: string;
  active: boolean;
  state: "online" | "offline" | "unknown";
  onOpen: () => void;
  onMore: () => void;
  chevron: string;
}) {
  const cards = useDashboardCards(host);
  const { navigateToSessions } = useTerminalSessions();
  return (
    <View className="gap-2">
      <Pressable
        onPress={onOpen}
        onLongPress={onMore}
        accessibilityRole="button"
        accessibilityHint={t("home.cards.pinnedCard.opensTheTerminalHoldFor")}
        className="flex-row items-center gap-2 active:opacity-70"
      >
        <Dot state={state} />
        <View className="min-w-0 flex-1">
          <Text
            weight="bold"
            className="text-sm text-foreground"
            numberOfLines={1}
          >
            {host.name || host.ip}
          </Text>
          <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
            {host.username ? `${host.username}@` : ""}
            {host.ip}
          </Text>
        </View>
        <ChevronRight size={16} color={chevron} />
      </Pressable>
      {cards.length === 0 ? (
        <Text className="text-[11px] text-muted-foreground">
          {t("home.cards.pinnedCard.turnOnDockerOrServices")}
        </Text>
      ) : (
        cards.map((card) => {
          const Card = card.component;
          return (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityHint={t("home.cards.pinnedCard.opens", {
                title: card.title,
              })}
              onPress={() => void navigateToSessions(host, card.tabType)}
            >
              {/* a11y-reads-children: each card draws its own text */}
              <Card host={host} accountId={accountId} active={active} />
            </Pressable>
          );
        })
      )}
    </View>
  );
}
