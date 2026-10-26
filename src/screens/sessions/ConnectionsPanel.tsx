import { useEffect, useState, useCallback, useRef } from "react";
import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import { Plug, SquareTerminal, ExternalLink, X } from "lucide-react-native";
import { features, useFeatureContext } from "@/core/features";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { Text, useConfirm } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { SSHHost } from "@/types";
import { accounts, api } from "@/core/accounts";
import type { ActiveSessionInfo, OpenTabRecord } from "@/core/api/types";

/**
 * Icon and label for a tab, from a local session type or an open-tabs record
 * type. Unknown types come from plugins the app has no screen for.
 */
function describeTab(tabType: string) {
  const local = features.sessionTab(tabType);
  if (local) return { icon: local.icon, label: local.shortLabel({}) };
  const remote = features.sessionTabForServerType(tabType);
  if (remote) {
    return { icon: remote.tab.icon, label: remote.tab.shortLabel(remote.opts) };
  }
  return { icon: SquareTerminal, label: tabType };
}

/** Whether a server record can be reopened here, and how. */
function restoreTarget(tabType: string) {
  const found = features.sessionTabForServerType(tabType);
  if (!found) return null;
  const ctx = { account: accounts.active(), client: accounts.activeClient() };
  if (!features.canOpen(found.tab.type, found.opts, ctx)) return null;
  return { type: found.tab.type, opts: found.opts };
}

function SectionHeader({
  label,
  count,
  action,
}: {
  label: string;
  count: number;
  action?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
      <Text
        weight="bold"
        className="flex-1 text-[10px] uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </Text>
      <View className="bg-muted px-1.5 py-0.5">
        <Text className="text-[10px] text-muted-foreground">{count}</Text>
      </View>
      {action}
    </View>
  );
}

function ConnectionRow({
  isActive,
  isLive,
  tabType,
  name,
  subLabel,
  onSwitch,
  onClose,
  reconnectHint,
}: {
  isActive?: boolean;
  isLive: boolean;
  tabType: string;
  name: string;
  subLabel: string;
  onSwitch: () => void;
  onClose: () => void;
  reconnectHint?: boolean;
}) {
  const color = useThemeColor();
  const { icon: TabIcon, label } = describeTab(tabType);
  const iconColor =
    (isActive ? color("accent-brand") : color("muted-foreground")) ?? "#a4a4a4";

  return (
    <Pressable
      onPress={onSwitch}
      className={`flex-row items-center gap-2.5 border-b border-border/40 px-4 py-3 active:bg-muted/40 ${
        isActive ? "border-l-2 border-l-accent-brand bg-accent-brand/10" : ""
      }`}
    >
      <View
        className={`h-7 w-7 items-center justify-center ${
          isActive ? "bg-accent-brand/15" : "bg-muted/60"
        }`}
      >
        <TabIcon size={16} color={iconColor} />
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <View
            style={{
              backgroundColor: isLive
                ? "#22c55e"
                : (color("muted-foreground", 0.3) ?? "#555"),
            }}
            className="h-1.5 w-1.5 rounded-full"
          />
          <Text
            weight="medium"
            className={`flex-1 text-xs ${isActive ? "text-accent-brand" : "text-foreground"}`}
            numberOfLines={1}
          >
            {name}
          </Text>
          <View className="border border-border/60 px-1 py-px">
            <Text className="text-[9px] text-muted-foreground">{label}</Text>
          </View>
        </View>
        <Text
          className="mt-0.5 pl-3 text-[10px] text-muted-foreground/70"
          numberOfLines={1}
        >
          {subLabel}
        </Text>
      </View>
      <View className="shrink-0 flex-row items-center gap-1">
        {reconnectHint ? (
          <ExternalLink size={13} color={color("muted-foreground")} />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={(e) => {
            e.stopPropagation();
            onClose();
          }}
          hitSlop={8}
          className="h-6 w-6 items-center justify-center"
        >
          <X size={13} color={color("muted-foreground")} />
        </Pressable>
      </View>
    </Pressable>
  );
}

/**
 * ConnectionsPanel - the central connections surface. Shows tabs open on this
 * device (Open) plus tabs/sessions that exist server-side but aren't open here
 * (Background - e.g. opened on desktop, or backgrounded). Reviving a background
 * tab reconnects to its live backend session when one exists, enabling
 * cross-device tab switching.
 */
export function ConnectionsPanel({ onClose }: { onClose?: () => void }) {
  const color = useThemeColor();
  // Re-render when plugins turn on or off.
  useFeatureContext();
  const {
    sessions,
    activeSessionId,
    backgroundTabRecords,
    refreshBackgroundTabs,
    setActiveSession,
    removeSession,
    addSession,
    navigateToSessions,
    forgetBackgroundTab,
    closeAllSessions,
  } = useTerminalSessions();
  const confirm = useConfirm();

  const closeAll = async () => {
    const ok = await confirm({
      title: `Close all ${sessions.length} tabs?`,
      description: "Every session ends.",
      confirmLabel: "Close all",
    });
    if (!ok) return;
    closeAllSessions();
    onClose?.();
  };

  const [activeSessions, setActiveSessions] = useState<ActiveSessionInfo[]>([]);
  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef(refreshBackgroundTabs);
  refreshRef.current = refreshBackgroundTabs;

  const refresh = useCallback(async () => {
    const client = accounts.activeClient();
    if (!client) {
      await refreshRef.current();
      return;
    }
    const [live] = await Promise.all([
      client.api.openTabs.getActiveSessions(),
      refreshRef.current(),
    ]);
    setActiveSessions(live);
  }, []);

  useEffect(() => {
    accounts
      .activeClient()
      ?.api.hosts.getSSHHosts()
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.hosts ?? []);
        setHosts(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // refresh is stable (no deps); interval starts once and runs until unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessionByInstance = new Map(
    activeSessions.map((s) => [s.tabInstanceId, s]),
  );

  // Background = server records whose instanceId isn't an open tab here.
  const openInstanceIds = new Set(sessions.map((s) => s.instanceId));
  const backgroundTabs = backgroundTabRecords.filter(
    (r) => !openInstanceIds.has(r.id) && !!restoreTarget(r.tabType),
  );

  const reviveBackground = (record: OpenTabRecord) => {
    const host = hosts.find((h) => h.id === record.hostId);
    const target = restoreTarget(record.tabType);
    if (!host || !target) return;
    const live = sessionByInstance.get(record.id);
    addSession(host, target.type, {
      instanceId: record.id,
      restoredSessionId: live?.sessionId ?? record.backendSessionId ?? null,
      remoteProtocol: target.opts.remoteProtocol,
    });
    navigateToSessions();
    onClose?.();
  };

  const hasAny = sessions.length > 0 || backgroundTabs.length > 0;

  if (!hasAny) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-muted/40">
          <Plug size={22} color={color("muted-foreground", 0.5)} />
        </View>
        <Text
          weight="medium"
          className="text-center text-sm text-muted-foreground"
        >
          No active connections
        </Text>
        <Text className="text-center text-xs text-muted-foreground/60">
          Connect to a host to start a session. Tabs you open on other devices
          will appear here too.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
          tintColor={color("accent-brand")}
        />
      }
    >
      {sessions.length > 0 ? (
        <View>
          <SectionHeader
            label="Open"
            count={sessions.length}
            action={
              sessions.length > 1 ? (
                <Pressable
                  onPress={closeAll}
                  hitSlop={8}
                  accessibilityRole="button"
                  className="px-1 active:opacity-70"
                >
                  <Text className="text-[11px] text-destructive">
                    Close all
                  </Text>
                </Pressable>
              ) : undefined
            }
          />
          {sessions.map((s) => {
            const live = sessionByInstance.get(s.instanceId);
            const isLive = features.sessionHas(s.type, "terminal-input")
              ? (live?.isConnected ?? !!s.backendSessionId)
              : true;
            return (
              <ConnectionRow
                key={s.id}
                isActive={s.id === activeSessionId}
                isLive={isLive}
                tabType={
                  features
                    .sessionTab(s.type)
                    ?.toServerTabType(s, accounts.client(s.accountId)) ?? s.type
                }
                name={s.host.name}
                subLabel={
                  s.host.username
                    ? `${s.host.username}@${s.host.ip}`
                    : s.host.ip
                }
                onSwitch={() => {
                  setActiveSession(s.id);
                  navigateToSessions();
                  onClose?.();
                }}
                onClose={() => removeSession(s.id)}
              />
            );
          })}
        </View>
      ) : null}

      {backgroundTabs.length > 0 ? (
        <View className={sessions.length > 0 ? "mt-2" : ""}>
          <SectionHeader label="Background" count={backgroundTabs.length} />
          <View className="border-b border-border/40 px-4 py-1.5">
            <Text className="text-[10px] text-muted-foreground/60">
              Sessions from other devices or backgrounded tabs. Tap to revive.
            </Text>
          </View>
          {backgroundTabs.map((r) => {
            const host = hosts.find((h) => h.id === r.hostId);
            const live = sessionByInstance.get(r.id);
            return (
              <ConnectionRow
                key={r.id}
                isLive={live?.isConnected ?? false}
                tabType={r.tabType}
                name={host?.name ?? r.label}
                subLabel={
                  live?.isConnected ? "Live, tap to reconnect" : "Tap to reopen"
                }
                reconnectHint
                onSwitch={() => reviveBackground(r)}
                onClose={async () => {
                  await api().openTabs.deleteOpenTab(r.id);
                  forgetBackgroundTab(r.id);
                }}
              />
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}
