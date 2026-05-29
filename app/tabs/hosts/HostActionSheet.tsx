import { View, ScrollView } from "react-native";
import {
  SquareTerminal,
  FolderOpen,
  Activity,
  Network,
  Container,
  Monitor,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react-native";
import { SSHHost } from "@/types";
import { useTerminalSessions } from "@/app/contexts/TerminalSessionsContext";
import type { SessionType } from "@/app/contexts/TerminalSessionsContext";
import { BottomSheet, SheetRow, Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { StatsConfig, DEFAULT_STATS_CONFIG } from "@/constants/stats-config";

function parseStatsConfig(host: SSHHost): StatsConfig {
  try {
    return host.statsConfig ? JSON.parse(host.statsConfig) : DEFAULT_STATS_CONFIG;
  } catch {
    return DEFAULT_STATS_CONFIG;
  }
}

export function HostActionSheet({
  host,
  status,
  visible,
  onClose,
  onEdit,
  onTogglePin,
  onDelete,
}: {
  host: SSHHost | null;
  status: "online" | "offline" | "unknown";
  visible: boolean;
  onClose: () => void;
  onEdit: (host: SSHHost) => void;
  onTogglePin: (host: SSHHost) => void;
  onDelete: (host: SSHHost) => void;
}) {
  const { navigateToSessions } = useTerminalSessions();
  const color = useThemeColor();
  const iconColor = color("foreground") ?? "#fafafa";
  const accent = color("accent-brand") ?? "#f59145";

  if (!host) return null;

  const open = (type: SessionType) => {
    navigateToSessions(host, type);
    onClose();
  };

  const statsEnabled = parseStatsConfig(host).metricsEnabled;
  const hasRemoteDesktop =
    host.enableRdp || host.enableVnc || host.enableTelnet;

  const dotColor =
    status === "online" ? "#22c55e" : status === "offline" ? "#ef4444" : "#9ca3af";

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View className="flex-row items-center gap-2.5 px-4 pb-3 pt-1 border-b border-border">
        <View
          style={{ backgroundColor: dotColor }}
          className="w-2.5 h-2.5 rounded-full"
        />
        <View className="flex-1 min-w-0">
          <Text weight="bold" className="text-base text-foreground" numberOfLines={1}>
            {host.name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {host.username ? `${host.username}@` : ""}
            {host.ip}
            {host.port ? `:${host.port}` : ""}
          </Text>
        </View>
      </View>

      <ScrollView style={{ maxHeight: 420 }}>
        {host.enableTerminal !== false ? (
          <SheetRow
            icon={<SquareTerminal size={18} color={iconColor} />}
            label="Terminal"
            onPress={() => open("terminal")}
          />
        ) : null}
        {host.enableFileManager ? (
          <SheetRow
            icon={<FolderOpen size={18} color={iconColor} />}
            label="File Manager"
            onPress={() => open("filemanager")}
          />
        ) : null}
        {statsEnabled ? (
          <SheetRow
            icon={<Activity size={18} color={iconColor} />}
            label="Server Stats"
            onPress={() => open("stats")}
          />
        ) : null}
        {host.enableTunnel &&
        host.tunnelConnections &&
        host.tunnelConnections.length > 0 ? (
          <SheetRow
            icon={<Network size={18} color={iconColor} />}
            label="Tunnels"
            onPress={() => open("tunnel")}
          />
        ) : null}
        {host.enableDocker ? (
          <SheetRow
            icon={<Container size={18} color={iconColor} />}
            label="Docker"
            onPress={() => open("docker")}
          />
        ) : null}
        {hasRemoteDesktop ? (
          <SheetRow
            icon={<Monitor size={18} color={iconColor} />}
            label="Remote Desktop"
            onPress={() => open("remoteDesktop")}
          />
        ) : null}

        {/* Management actions */}
        <SheetRow
          icon={<Pencil size={18} color={accent} />}
          label="Edit Host"
          onPress={() => {
            onEdit(host);
            onClose();
          }}
        />
        <SheetRow
          icon={
            host.pin ? (
              <PinOff size={18} color={iconColor} />
            ) : (
              <Pin size={18} color={iconColor} />
            )
          }
          label={host.pin ? "Unpin" : "Pin"}
          onPress={() => {
            onTogglePin(host);
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
