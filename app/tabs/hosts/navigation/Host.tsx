import { View, Pressable } from "react-native";
import { Pin } from "lucide-react-native";
import { SSHHost } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

interface HostProps {
  host: SSHHost;
  status: "online" | "offline" | "unknown";
  showTags?: boolean;
  onPress: (host: SSHHost) => void;
}

const STATUS_COLOR: Record<HostProps["status"], string> = {
  online: "#22c55e",
  offline: "#ef4444",
  unknown: "#9ca3af",
};

/** Compact protocol/feature tag (e.g. RDP, VNC, Docker) shown beside a host. */
function FeatureChip({ label }: { label: string }) {
  return (
    <View className="px-1.5 py-px bg-muted border border-border">
      <Text className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

export default function Host({ host, status, showTags = true, onPress }: HostProps) {
  const color = useThemeColor();

  const protocols: string[] = [];
  if (host.enableRdp) protocols.push("RDP");
  if (host.enableVnc) protocols.push("VNC");
  if (host.enableTelnet) protocols.push("TEL");
  if (host.enableDocker) protocols.push("DKR");

  return (
    <Pressable
      onPress={() => onPress(host)}
      className="flex-row items-center gap-3 px-3 py-3 bg-card border border-border active:bg-muted/40"
    >
      {/* Status dot */}
      <View
        style={{ backgroundColor: STATUS_COLOR[status] }}
        className="w-2.5 h-2.5 rounded-full shrink-0"
      />

      {/* Name + address */}
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-1.5">
          <Text
            weight="medium"
            className="text-sm text-foreground shrink"
            numberOfLines={1}
          >
            {host.name}
          </Text>
          {host.pin ? (
            <Pin size={11} color={color("accent-brand")} fill={color("accent-brand")} />
          ) : null}
          {protocols.map((p) => (
            <FeatureChip key={p} label={p} />
          ))}
        </View>
        <Text className="text-[11px] text-muted-foreground mt-0.5" numberOfLines={1}>
          {host.username ? `${host.username}@` : ""}
          {host.ip}
          {host.port ? `:${host.port}` : ""}
        </Text>

        {showTags && host.tags && host.tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-1 mt-1.5">
            {host.tags.slice(0, 4).map((tag, i) => (
              <View
                key={`${tag}-${i}`}
                className="px-1.5 py-px bg-muted/60 border border-border/60"
              >
                <Text className="text-[9px] text-muted-foreground" numberOfLines={1}>
                  {tag}
                </Text>
              </View>
            ))}
            {host.tags.length > 4 ? (
              <View className="px-1.5 py-px">
                <Text className="text-[9px] text-muted-foreground">
                  +{host.tags.length - 4}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
