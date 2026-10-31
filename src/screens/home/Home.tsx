import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  ChevronRight,
  Clock,
  Plus,
  Server,
  SquareTerminal,
  Zap,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useAppContext } from "@/contexts/AppContext";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { displayTitle } from "@/contexts/session-tabs";
import { useAccounts } from "@/core/accounts";
import { useLiveList, useRepositories } from "@/core/data/hooks";
import { features } from "@/core/features/registry";
import {
  useCapability,
  useDashboardCards,
  useQuickActions,
} from "@/core/features/hooks";
import { useRecentHosts } from "@/core/hosts/recent";
import { useSessionStatuses } from "@/core/sessions/status";
import { HostActionSheet } from "@/screens/hosts/HostActionSheet";
import { QuickConnect } from "@/screens/hosts/QuickConnect";
import { useOpenHost } from "@/screens/hosts/useOpenHost";
import {
  statusLabel,
  TabStatusMark,
} from "@/screens/sessions/navigation/TabStatusMark";
import { AccountButton, SearchButton } from "@/screens/shell/AppHeader";
import type { SSHHost } from "@/types";
import { Button, EmptyState, ListRow, SectionLabel, Text } from "@/ui";
import { isSshHost } from "@/utils/hosts";
import { openTab } from "@/screens/shell/navigate";
import { ServerReachBanner } from "./ServerReachBanner";

const RECENT_SHOWN = 5;

/** Pinned hosts, newest name order, SSH first since only they have cards. */
export function pinnedHosts(hosts: SSHHost[]): SSHHost[] {
  return hosts
    .filter((h) => h.pin)
    .sort(
      (a, b) =>
        Number(isSshHost(b)) - Number(isSshHost(a)) ||
        (a.name || a.ip).localeCompare(b.name || b.ip),
    );
}

function SectionTitle({ children }: { children: string }) {
  return <SectionLabel>{children}</SectionLabel>;
}

/** Open sessions, quick connect, pinned hosts with live cards, recent hosts. */
export default function Home() {
  const repos = useRepositories();
  const { active: account } = useAccounts();
  const { openAuthFlow } = useAppContext();
  const color = useThemeColor();
  const openHost = useOpenHost();
  const [focused, setFocused] = useState(true);
  const [sheetHost, setSheetHost] = useState<SSHHost | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const canQuickConnect = useCapability("host.quickConnect");
  const hosts = useLiveList(repos.hosts, () => repos.hosts.list(), [repos]);
  const pinned = pinnedHosts(hosts.data);
  const recent = useRecentHosts(account.id, hosts.data)
    .filter((h) => !h.pin)
    .slice(0, RECENT_SHOWN);
  const quick = useQuickActions();
  const muted = color("muted-foreground");

  // Cards only poll while Home is the screen in front.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const toHosts = () => openTab("/(tabs)/hosts");
  const tap = (host: SSHHost) =>
    void openHost(host).then((opened) => !opened && setSheetHost(host));
  const noHosts = !hosts.loading && hosts.data.length === 0;

  return (
    <Screen titleNode={<AccountButton />} headerRight={<SearchButton />}>
      <ScrollView
        contentContainerStyle={{ padding: 12, gap: 16, paddingBottom: 48 }}
      >
        <ServerReachBanner />
        <OpenSessions />

        {canQuickConnect ? (
          <View className="border border-border">
            <ListRow
              title="Quick connect"
              icon={<Zap size={16} color={muted} />}
              meta={
                <Text className="text-meta text-muted-foreground">
                  user@host:port, without saving
                </Text>
              }
              trailing={<ChevronRight size={16} color={muted} />}
              onPress={() => setQuickOpen(true)}
            />
          </View>
        ) : null}

        <QuickActions {...quick} />

        {noHosts ? (
          <EmptyState
            icon={Server}
            title="Add your first host"
            hint="Hosts you open show up here, and pinned hosts show live cards."
            action={
              <View className="items-center gap-2">
                <Button
                  size="sm"
                  onPress={() => openTab("/(tabs)/hosts?action=new")}
                  icon={<Plus size={15} color={color("accent-brand")} />}
                >
                  Add host
                </Button>
                {account.kind === "local" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => openAuthFlow("server")}
                  >
                    Link a server
                  </Button>
                ) : null}
              </View>
            }
          />
        ) : null}

        {pinned.length > 0 ? (
          <View className="gap-4">
            <SectionTitle>Pinned</SectionTitle>
            {pinned.map((host) => (
              <HostSection
                key={`${account.id}:${host.id}`}
                host={host}
                accountId={account.id}
                active={focused}
                onOpen={() => tap(host)}
                onMore={() => setSheetHost(host)}
                chevron={muted}
              />
            ))}
          </View>
        ) : null}

        {recent.length > 0 ? (
          <View>
            <SectionTitle>Recent</SectionTitle>
            <View className="border border-border">
              {recent.map((host, index) => (
                <ListRow
                  key={host.id}
                  index={index}
                  title={host.name || host.ip}
                  icon={<Clock size={16} color={muted} />}
                  meta={
                    <Text className="text-meta text-muted-foreground">
                      {host.username ? `${host.username}@` : ""}
                      {host.ip}
                    </Text>
                  }
                  onPress={() => tap(host)}
                  onLongPress={() => setSheetHost(host)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {!noHosts && pinned.length === 0 && !hosts.loading ? (
          <EmptyState
            icon={Server}
            title="Pin a host to see it here"
            hint="Pinned hosts show their metrics, Docker and services at a glance. Hold a host to pin it."
            action={
              <Button size="sm" onPress={toHosts}>
                Go to hosts
              </Button>
            }
          />
        ) : null}
      </ScrollView>
      <HostActionSheet
        host={sheetHost}
        status="unknown"
        visible={sheetHost !== null}
        onClose={() => setSheetHost(null)}
        onEdit={toHosts}
        onClone={toHosts}
        onDelete={toHosts}
      />
      <QuickConnect visible={quickOpen} onClose={() => setQuickOpen(false)} />
    </Screen>
  );
}

/** Cards for the tabs that are open, to jump back in. */
function OpenSessions() {
  const color = useThemeColor();
  const { sessions, activeSessionId, setActiveSession } = useTerminalSessions();
  const statuses = useSessionStatuses();
  if (sessions.length === 0) return null;
  const muted = color("muted-foreground");

  return (
    <View>
      <SectionTitle>Open sessions</SectionTitle>
      <View className="border border-border">
        {sessions.map((session, index) => {
          const Icon =
            features.sessionTab(session.type)?.icon ?? SquareTerminal;
          const state = statuses[session.id]?.state;
          return (
            <ListRow
              key={session.id}
              index={index}
              selected={session.id === activeSessionId}
              title={displayTitle(session)}
              icon={<Icon size={16} color={muted} />}
              meta={
                <Text className="text-meta text-muted-foreground">
                  {statusLabel(state) ??
                    (state === "connected" ? "Connected" : session.host.ip)}
                </Text>
              }
              trailing={<TabStatusMark state={state} />}
              onPress={() => {
                setActiveSession(session.id);
                openTab("/(tabs)/sessions");
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/** Screens from features and server plugins. */
function QuickActions({ ctx, actions }: ReturnType<typeof useQuickActions>) {
  const color = useThemeColor();
  if (actions.length === 0) return null;
  return (
    <View>
      <SectionTitle>From your server</SectionTitle>
      <View className="border border-border">
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <ListRow
              key={action.id}
              index={index}
              title={action.label}
              icon={<Icon size={16} color={color("muted-foreground")} />}
              onPress={() => action.run(ctx)}
            />
          );
        })}
      </View>
    </View>
  );
}

function HostSection({
  host,
  accountId,
  active,
  onOpen,
  onMore,
  chevron,
}: {
  host: SSHHost;
  accountId: string;
  active: boolean;
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
        accessibilityHint="Opens the terminal. Hold for more."
        className="flex-row items-center gap-2 active:opacity-70"
      >
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
          Turn on Docker or Services for this host, or tap it to connect.
        </Text>
      ) : (
        cards.map((card) => {
          const Card = card.component;
          return (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityHint={`Opens ${card.title}`}
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
