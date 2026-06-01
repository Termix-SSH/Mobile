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
import { Text, Badge } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { MONO_FONT } from "@/app/constants/fonts";
import { toast } from "@/app/utils/toast";

/**
 * One configured tunnel: source:port → endpoint:port, live status badge, and
 * connect/disconnect/cancel controls gated by the current state. Restyled onto
 * theme tokens (no designTokens) to match the redesigned sessions.
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
    <View className="bg-card border border-border p-3.5 gap-3">
      {/* Header: title + status badge */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
          <StatusIcon size={14} color={info.color} />
          <Text
            weight="medium"
            className="text-sm text-foreground"
            numberOfLines={1}
          >
            Tunnel · {tunnel.sourcePort}
          </Text>
        </View>
        <Badge variant={info.badge}>{info.label}</Badge>
      </View>

      {/* Port mapping */}
      <Pressable
        onPress={copyLocal}
        className="bg-background border border-border px-3 py-2.5 flex-row items-center gap-2 active:bg-muted/30"
      >
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text className="text-[10px] uppercase tracking-[1px] text-muted-foreground">
              Port Mapping
            </Text>
            {(tunnel.mode || tunnel.tunnelType) ? (
              <Text className="text-[9px] uppercase tracking-[1px] text-accent-brand font-medium">
                {(tunnel.mode || tunnel.tunnelType)!.toUpperCase()}
              </Text>
            ) : null}
          </View>
          <Text
            className="text-[13px] text-foreground mt-0.5"
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
      {(statusValue === "ERROR" || statusValue === "FAILED") && status?.reason ? (
        <View className="bg-destructive/10 border border-destructive/30 px-2.5 py-2">
          <Text className="text-[11px] text-destructive" numberOfLines={3}>
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
      className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 border ${
        accent
          ? "border-accent-brand/40 bg-accent-brand/10"
          : "border-border"
      } ${loading ? "opacity-50" : "active:opacity-80"}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color("accent-brand")} />
      ) : (
        <>
          {icon}
          <Text
            className={`text-xs ${accent ? "text-accent-brand" : "text-foreground"}`}
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
      return { label: "Connected", color: "#22c55e", icon: CheckCircle, badge: "success" };
    case "CONNECTING":
      return { label: "Connecting", color: color("accent-brand") ?? "#f59145", icon: RotateCcw, badge: "accent" };
    case "DISCONNECTING":
      return { label: "Disconnecting", color: "#f59e0b", icon: RotateCcw, badge: "muted" };
    case "ERROR":
    case "FAILED":
      return { label: "Error", color: color("destructive") ?? "#ef4444", icon: AlertCircle, badge: "destructive" };
    case "RETRYING":
      return {
        label: `Retrying (${status?.retryCount || 0}/${status?.maxRetries || 0})`,
        color: "#f59e0b",
        icon: RotateCcw,
        badge: "muted",
      };
    case "WAITING":
      return {
        label: status?.nextRetryIn
          ? `Waiting ${Math.ceil(status.nextRetryIn / 1000)}s`
          : "Waiting",
        color: "#8b5cf6",
        icon: Clock,
        badge: "muted",
      };
    default:
      return { label: "Disconnected", color: color("muted-foreground") ?? "#888", icon: Circle, badge: "muted" };
  }
}
