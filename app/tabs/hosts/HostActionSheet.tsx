import { View, ScrollView } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  Terminal,
  FolderSearch,
  Server,
  Network,
  Box,
  Monitor,
  MousePointerClick,
  MessagesSquare,
  Pencil,
  Copy,
  CopyPlus,
  Trash2,
  Zap,
} from "lucide-react-native";
import { SSHHost } from "@/types";
import type { HostMetrics } from "@/app/tabs/hosts/navigation/Host";
import { useTerminalSessions } from "@/app/contexts/TerminalSessionsContext";
import type { SessionType } from "@/app/contexts/TerminalSessionsContext";
import { BottomSheet, SheetRow, Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
import { StatsConfig, DEFAULT_STATS_CONFIG } from "@/constants/stats-config";
import { wakeHost } from "@/app/main-axios";

function parseStatsConfig(host: SSHHost): StatsConfig {
  try {
    return host.statsConfig
      ? JSON.parse(host.statsConfig)
      : DEFAULT_STATS_CONFIG;
  } catch {
    return DEFAULT_STATS_CONFIG;
  }
}

/**
 * Whether the host speaks SSH. The redesigned multi-protocol backend sets
 * `enableSsh`; legacy SSH-only hosts omit it, so undefined means SSH-enabled
 * (matches the web's getSshActions gating).
 */
function isSshHost(host: SSHHost): boolean {
  if (host.enableSsh != null) return host.enableSsh;
  return !host.enableRdp && !host.enableVnc && !host.enableTelnet;
}

export function HostActionSheet({
  host,
  status,
  metrics,
  visible,
  onClose,
  onEdit,
  onClone,
  onDelete,
}: {
  host: SSHHost | null;
  status: "online" | "offline" | "unknown";
  metrics?: HostMetrics;
  visible: boolean;
  onClose: () => void;
  onEdit: (host: SSHHost) => void;
  onClone: (host: SSHHost) => void;
  onDelete: (host: SSHHost) => void;
}) {
  const { navigateToSessions } = useTerminalSessions();
  const color = useThemeColor();
  const iconColor = color("foreground") ?? "#fafafa";

  if (!host) return null;

  const open = (type: SessionType) => {
    navigateToSessions(host, type);
    onClose();
  };

  const copyAddress = async () => {
    await Clipboard.setStringAsync(
      `${host.username ? `${host.username}@` : ""}${host.ip}`,
    );
    toast.success("Address copied");
    onClose();
  };

  const handleWake = async () => {
    onClose();
    try {
      await wakeHost(host.id);
      toast.success(`Wake-on-LAN sent to ${host.name}`);
    } catch {
      toast.error("Failed to send Wake-on-LAN packet");
    }
  };

  const ssh = isSshHost(host);
  const metricsEnabled = ssh && parseStatsConfig(host).metricsEnabled !== false;

  // SSH-gated connection actions (mirrors the web's getSshActions).
  const sshActions = [
    ssh && host.enableTerminal !== false
      ? { type: "terminal" as SessionType, icon: Terminal, label: "Terminal" }
      : null,
    ssh && host.enableFileManager
      ? {
          type: "filemanager" as SessionType,
          icon: FolderSearch,
          label: "File Manager",
        }
      : null,
    ssh && host.enableDocker
      ? { type: "docker" as SessionType, icon: Box, label: "Docker" }
      : null,
    ssh &&
    host.enableTunnel &&
    host.tunnelConnections &&
    host.tunnelConnections.length > 0
      ? { type: "tunnel" as SessionType, icon: Network, label: "Tunnels" }
      : null,
    metricsEnabled
      ? { type: "stats" as SessionType, icon: Server, label: "Server Stats" }
      : null,
  ].filter(Boolean) as {
    type: SessionType;
    icon: typeof Terminal;
    label: string;
  }[];

  // Separate protocol actions (RDP / VNC / Telnet), each with its own icon —
  // matches the web rather than lumping them into one "Remote Desktop" row.
  const protocolActions = [
    host.enableRdp ? { icon: Monitor, label: "RDP" } : null,
    host.enableVnc ? { icon: MousePointerClick, label: "VNC" } : null,
    host.enableTelnet ? { icon: MessagesSquare, label: "Telnet" } : null,
  ].filter(Boolean) as { icon: typeof Monitor; label: string }[];

  const dotColor =
    status === "online"
      ? "#22c55e"
      : status === "offline"
        ? "#ef4444"
        : "#9ca3af";

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View className="flex-row items-center gap-2.5 border-b border-border px-4 pb-3 pt-1">
        <View
          style={{ backgroundColor: dotColor }}
          className="h-2.5 w-2.5 rounded-full"
        />
        <View className="min-w-0 flex-1">
          <Text
            weight="bold"
            className="text-base text-foreground"
            numberOfLines={1}
          >
            {host.name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {host.username ? `${host.username}@` : ""}
            {host.ip}
            {host.port ? `:${host.port}` : ""}
          </Text>
        </View>
        {status === "online" &&
        metrics &&
        (metrics.cpu != null || metrics.ram != null) ? (
          <View className="shrink-0 items-end">
            {metrics.cpu != null ? (
              <Text className="text-[10px] text-muted-foreground">
                CPU {Math.round(metrics.cpu)}%
              </Text>
            ) : null}
            {metrics.ram != null ? (
              <Text className="text-[10px] text-muted-foreground">
                RAM {Math.round(metrics.ram)}%
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <ScrollView style={{ maxHeight: 440 }}>
        {/* Connection actions (SSH features + protocols) */}
        {sshActions.map(({ type, icon: Icon, label }) => (
          <SheetRow
            key={type}
            icon={<Icon size={18} color={iconColor} />}
            label={label}
            onPress={() => open(type)}
          />
        ))}
        {protocolActions.map(({ icon: Icon, label }) => (
          <SheetRow
            key={label}
            icon={<Icon size={18} color={iconColor} />}
            label={label}
            onPress={() => open("remoteDesktop")}
          />
        ))}

        {/* Management actions (no pin — matches the web). Rows sit flush with
            the connection group; each row's own bottom border separates them. */}
        {host.macAddress ? (
          <SheetRow
            icon={<Zap size={18} color={iconColor} />}
            label="Wake on LAN"
            onPress={handleWake}
          />
        ) : null}
        <SheetRow
          icon={<Pencil size={18} color={iconColor} />}
          label="Edit Host"
          onPress={() => {
            onEdit(host);
            onClose();
          }}
        />
        <SheetRow
          icon={<Copy size={18} color={iconColor} />}
          label="Copy Address"
          onPress={copyAddress}
        />
        <SheetRow
          icon={<CopyPlus size={18} color={iconColor} />}
          label="Clone Host"
          onPress={() => {
            onClone(host);
            onClose();
          }}
        />
        <SheetRow
          icon={<Trash2 size={18} color={color("destructive")} />}
          label="Delete Host"
          destructive
          onPress={() => {
            onDelete(host);
            onClose();
          }}
        />
      </ScrollView>
    </BottomSheet>
  );
}
