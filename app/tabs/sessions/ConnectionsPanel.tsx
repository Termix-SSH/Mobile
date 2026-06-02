import { useEffect, useState, useCallback, useRef } from "react";
import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import {
  Plug,
  SquareTerminal,
  FolderOpen,
  Activity,
  Network,
  Container,
  Monitor,
  ExternalLink,
  X,
} from "lucide-react-native";
import {
  getActiveSessions,
  type ActiveSessionInfo,
  type OpenTabRecord,
} from "@/app/main-axios";
import {
  useTerminalSessions,
  type SessionType,
} from "@/app/contexts/TerminalSessionsContext";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { SSHHost } from "@/types";
import { getSSHHosts, deleteOpenTab } from "@/app/main-axios";

const TYPE_LABELS: Record<string, string> = {
  terminal: "SSH",
  files: "Files",
  filemanager: "Files",
  stats: "Stats",
  tunnel: "Tunnel",
  docker: "Docker",
  rdp: "RDP",
  vnc: "VNC",
  telnet: "Telnet",
  remoteDesktop: "Remote",
};

function tabIcon(type: string, color: string) {
  const size = 16;
  switch (type) {
    case "files":
    case "filemanager":
      return <FolderOpen size={size} color={color} />;
    case "stats":
      return <Activity size={size} color={color} />;
    case "tunnel":
      return <Network size={size} color={color} />;
    case "docker":
      return <Container size={size} color={color} />;
    case "rdp":
    case "vnc":
    case "telnet":
    case "remoteDesktop":
      return <Monitor size={size} color={color} />;
    default:
      return <SquareTerminal size={size} color={color} />;
  }
}

/** Map an open-tabs record tabType back to our local SessionType. */
function toSessionType(tabType: string): SessionType {
  switch (tabType) {
    case "files":
      return "filemanager";
    case "rdp":
    case "vnc":
    case "telnet":
      return "remoteDesktop";
    case "stats":
    case "tunnel":
    case "docker":
      return tabType as SessionType;
    default:
      return "terminal";
  }
}

function SectionHeader({ label, count }: { label: string; count: number }) {
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
        {tabIcon(tabType, iconColor)}
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
            <Text className="text-[9px] text-muted-foreground">
              {TYPE_LABELS[tabType] ?? tabType}
            </Text>
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
 * ConnectionsPanel — the central connections surface. Shows tabs open on this
 * device (Open) plus tabs/sessions that exist server-side but aren't open here
 * (Background — e.g. opened on desktop, or backgrounded). Reviving a background
 * tab reconnects to its live backend session when one exists, enabling
 * cross-device tab switching.
 */
export function ConnectionsPanel({ onClose }: { onClose?: () => void }) {
  const color = useThemeColor();
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
  } = useTerminalSessions();

  const [activeSessions, setActiveSessions] = useState<ActiveSessionInfo[]>([]);
  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef(refreshBackgroundTabs);
  refreshRef.current = refreshBackgroundTabs;

  const refresh = useCallback(async () => {
    const [live] = await Promise.all([
      getActiveSessions(),
      refreshRef.current(),
    ]);
    setActiveSessions(live);
  }, []);

  useEffect(() => {
    getSSHHosts()
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
    (r) => !openInstanceIds.has(r.id),
  );

  const reviveBackground = (record: OpenTabRecord) => {
    const host = hosts.find((h) => h.id === record.hostId);
    if (!host) return;
    const live = sessionByInstance.get(record.id);
    addSession(host, toSessionType(record.tabType), {
      instanceId: record.id,
      restoredSessionId: live?.sessionId ?? record.backendSessionId ?? null,
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
          <SectionHeader label="Open" count={sessions.length} />
          {sessions.map((s) => {
            const live = sessionByInstance.get(s.instanceId);
            const isLive =
              s.type === "terminal"
                ? (live?.isConnected ?? !!s.backendSessionId)
                : true;
            return (
              <ConnectionRow
                key={s.id}
                isActive={s.id === activeSessionId}
                isLive={isLive}
                tabType={s.type}
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
                  live?.isConnected
                    ? "Live — tap to reconnect"
                    : "Tap to reopen"
                }
                reconnectHint
                onSwitch={() => reviveBackground(r)}
                onClose={async () => {
                  await deleteOpenTab(r.id);
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
