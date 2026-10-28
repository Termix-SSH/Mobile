import { View, Pressable, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  Circle,
  Play,
  Square,
  X,
  RotateCcw,
  Copy,
} from "lucide-react-native";
import type { TunnelCardProps } from "@/types";
import { Text, Badge } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { MONO_FONT } from "@/constants/fonts";
import { toast } from "@/utils/toast";

/**
 * One configured tunnel: source:port → endpoint:port, live status badge, and
 * connect/disconnect/cancel controls gated by the current state.
 */
export default function TunnelCard({
  tunnel,
  status,
  isLoading,
  onAction,
}: TunnelCardProps) {
  const color = useThemeColor();

  const statusValue = status?.status?.toUpperCase() || "DISCONNECTED";
  const info = statusInfo(statusValue, status, color);
  const StatusIcon = info.icon;

  const canConnect =
    !status ||
    statusValue === "DISCONNECTED" ||
    statusValue === "ERROR" ||
    statusValue === "FAILED";
  const canDisconnect = statusValue === "CONNECTED";
  const canCancel =
    statusValue === "CONNECTING" ||
    statusValue === "RETRYING" ||
    statusValue === "WAITING";

  const copyLocal = async () => {
    await Clipboard.setStringAsync(`localhost:${tunnel.sourcePort}`);
    toast.success("Local endpoint copied");
  };

  return (
    <View className="gap-3 border border-border bg-card p-3.5">
      {/* Header: title + status badge */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          <StatusIcon size={14} color={info.color} />
          <Text
            weight="medium"
            className="text-sm text-foreground"
            numberOfLines={1}
          >
            Tunnel | {tunnel.sourcePort}
          </Text>
        </View>
        <Badge variant={info.badge}>{info.label}</Badge>
      </View>

      {/* Port mapping */}
      <Pressable
        onPress={copyLocal}
        className="flex-row items-center gap-2 border border-border bg-background px-3 py-2.5 active:bg-muted/30"
      >
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-[10px] uppercase tracking-[1px] text-muted-foreground">
              Port Mapping
            </Text>
            {tunnel.mode || tunnel.tunnelType ? (
              <Text className="text-[9px] font-medium uppercase tracking-[1px] text-accent-text">
                {(tunnel.mode || tunnel.tunnelType)!.toUpperCase()}
              </Text>
            ) : null}
          </View>
          <Text
            className="mt-0.5 text-[13px] text-foreground"
            style={{ fontFamily: MONO_FONT }}
            numberOfLines={1}
          >
            {tunnel.mode === "dynamic"
              ? `localhost:${tunnel.sourcePort} (SOCKS5 Proxy)`
              : `localhost:${tunnel.sourcePort} → ${tunnel.endpointHost}:${tunnel.endpointPort}`}
          </Text>
        </View>
        <Copy size={14} color={color("muted-foreground")} />
      </Pressable>

      {/* Error reason */}
      {(statusValue === "ERROR" || statusValue === "FAILED") &&
      status?.reason ? (
        <View className="border border-destructive/30 bg-destructive/10 px-2.5 py-2">
          <Text className="text-[11px] text-destructive-text" numberOfLines={3}>
            {status.reason}
          </Text>
        </View>
      ) : null}

      {/* Actions */}
      <View className="flex-row gap-2">
        {canConnect ? (
          <ActionButton
            icon={<Play size={14} color={color("accent-brand")} />}
            label="Connect"
            accent
            loading={isLoading}
            onPress={() => onAction("connect")}
          />
        ) : null}
        {canDisconnect ? (
          <ActionButton
            icon={<Square size={14} color={color("foreground")} />}
            label="Disconnect"
            loading={isLoading}
            onPress={() => onAction("disconnect")}
          />
        ) : null}
        {canCancel ? (
          <ActionButton
            icon={<X size={14} color={color("foreground")} />}
            label="Cancel"
            loading={isLoading}
            onPress={() => onAction("cancel")}
          />
        ) : null}
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  accent,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  accent?: boolean;
  loading?: boolean;
}) {
  const color = useThemeColor();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className={`flex-1 flex-row items-center justify-center gap-1.5 border py-2.5 ${
        accent ? "border-accent-brand/40 bg-accent-brand/10" : "border-border"
      } ${loading ? "opacity-50" : "active:opacity-80"}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color("accent-brand")} />
      ) : (
        <>
          {icon}
          <Text
            className={`text-xs ${accent ? "text-accent-text" : "text-foreground"}`}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function statusInfo(
  statusValue: string,
  status: TunnelCardProps["status"],
  color: ReturnType<typeof useThemeColor>,
): {
  label: string;
  color: string;
  icon: typeof Circle;
  badge: "success" | "muted" | "destructive" | "accent";
} {
  switch (statusValue) {
    case "CONNECTED":
      return {
        label: "Connected",
        color: color("success"),
        icon: CheckCircle,
        badge: "success",
      };
    case "CONNECTING":
      return {
        label: "Connecting",
        color: color("accent-brand"),
        icon: RotateCcw,
        badge: "accent",
      };
    case "DISCONNECTING":
      return {
        label: "Disconnecting",
        color: color("warning"),
        icon: RotateCcw,
        badge: "muted",
      };
    case "ERROR":
    case "FAILED":
      return {
        label: "Error",
        color: color("destructive"),
        icon: AlertCircle,
        badge: "destructive",
      };
    case "RETRYING":
      return {
        label: `Retrying (${status?.retryCount || 0}/${status?.maxRetries || 0})`,
        color: color("warning"),
        icon: RotateCcw,
        badge: "muted",
      };
    case "WAITING":
      return {
        label: status?.nextRetryIn
          ? `Waiting ${Math.ceil(status.nextRetryIn / 1000)}s`
          : "Waiting",
        color: color("muted-foreground"),
        icon: Clock,
        badge: "muted",
      };
    default:
      return {
        label: "Disconnected",
        color: color("muted-foreground"),
        icon: Circle,
        badge: "muted",
      };
  }
}
