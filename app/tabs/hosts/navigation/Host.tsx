import { View, Pressable } from "react-native";
import { Pin, Cpu, MemoryStick } from "lucide-react-native";
import { SSHHost } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import type { HostStatus } from "@/app/tabs/hosts/navigation/hostTree";

export interface HostMetrics {
  cpu: number | null;
  ram: number | null;
}

interface HostProps {
  host: SSHHost;
  status: HostStatus;
  metrics?: HostMetrics;
  showTags?: boolean;
  /** Even rows get a subtle striped background (matches the web density). */
  striped?: boolean;
  onPress: (host: SSHHost) => void;
}

/** Compact protocol/feature tag (e.g. RDP, VNC, DKR) shown beside a host. */
function FeatureChip({ label }: { label: string }) {
  return (
    <View className="border border-border/50 bg-muted/30 px-1 py-px">
      <Text className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </Text>
    </View>
  );
}

/** A thin labelled usage bar (CPU / RAM) shown on online hosts. */
function MetricBar({
  icon,
  value,
  high,
  mid,
}: {
  icon: React.ReactNode;
  value: number;
  high: number;
  mid: number;
}) {
  const color = useThemeColor();
  const accent = color("accent-brand") ?? "#f59145";
  const barColor = value > high ? "#f87171" : value > mid ? "#facc15" : accent;
  return (
    <View className="flex-row items-center gap-1">
      {icon}
      <View className="h-[3px] w-9 overflow-hidden rounded-full bg-muted-foreground/15">
        <View
          style={{
            width: `${Math.min(100, Math.max(0, value))}%`,
            backgroundColor: barColor,
          }}
          className="h-full rounded-full"
        />
      </View>
      <Text className="text-[9px] text-muted-foreground/50">
        {Math.round(value)}%
      </Text>
    </View>
  );
}

export default function Host({
  host,
  status,
  metrics,
  showTags = true,
  striped = false,
  onPress,
}: HostProps) {
  const color = useThemeColor();
  const accent = color("accent-brand") ?? "#f59145";
  const online = status === "online";

  const sshActive = host.enableSsh !== false && host.connectionType !== "rdp" && host.connectionType !== "vnc" && host.connectionType !== "telnet";
  const protocols: string[] = [];
  if (sshActive) protocols.push("SSH");
  if (host.enableRdp) protocols.push("RDP");
  if (host.enableVnc) protocols.push("VNC");
  if (host.enableTelnet) protocols.push("TEL");
  if (sshActive && host.enableTerminal) protocols.push("TERM");
  if (sshActive && host.enableFileManager) protocols.push("FILES");
  if (sshActive && host.enableTunnel) protocols.push("TUNNEL");
  if (host.enableDocker) protocols.push("DKR");

  const showCpu = online && metrics?.cpu != null && metrics.cpu > 0;
  const showRam = online && metrics?.ram != null && metrics.ram > 0;

  return (
    <Pressable
      onPress={() => onPress(host)}
      className={`flex-row items-stretch active:bg-muted/40 ${
        striped ? "bg-muted/20" : "bg-card"
      }`}
    >
      {/* Status stripe */}
      <View
        style={{ backgroundColor: online ? accent : "transparent" }}
        className="w-[3px] shrink-0"
      />

      <View className="min-w-0 flex-1 gap-1 px-2.5 py-2.5">
        {/* Name row */}
        <View className="flex-row items-center gap-1.5">
          <View
            style={{
              backgroundColor: online
                ? accent
                : color("muted-foreground", 0.25),
            }}
            className="h-1.5 w-1.5 shrink-0 rounded-full"
          />
          <Text
            weight="medium"
            className="shrink text-[13px] text-foreground"
            numberOfLines={1}
          >
            {host.name}
          </Text>
          {host.pin ? <Pin size={11} color={accent} fill={accent} /> : null}
          {protocols.map((p) => (
            <FeatureChip key={p} label={p} />
          ))}
        </View>

        {/* Address */}
        <Text
          className="pl-3 text-[11px] text-muted-foreground/60"
          numberOfLines={1}
        >
          {host.username ? `${host.username}@` : ""}
          {host.ip}
          {host.port ? `:${host.port}` : ""}
        </Text>

        {/* Live metrics */}
        {showCpu || showRam ? (
          <View className="mt-0.5 flex-row items-center gap-3 pl-3">
            {showCpu ? (
              <MetricBar
                icon={<Cpu size={10} color={color("muted-foreground", 0.4)} />}
                value={metrics!.cpu!}
                high={80}
                mid={50}
              />
            ) : null}
            {showRam ? (
              <MetricBar
                icon={
                  <MemoryStick
                    size={10}
                    color={color("muted-foreground", 0.4)}
                  />
                }
                value={metrics!.ram!}
                high={80}
                mid={60}
              />
            ) : null}
          </View>
        ) : null}

        {/* Tags */}
        {showTags && host.tags && host.tags.length > 0 ? (
          <View className="mt-0.5 flex-row flex-wrap items-center gap-1 pl-3">
            {host.tags.slice(0, 4).map((tag, i) => (
              <View
                key={`${tag}-${i}`}
                className="border border-border/50 bg-muted/30 px-1 py-px"
              >
                <Text
                  className="text-[9px] lowercase text-muted-foreground/70"
                  numberOfLines={1}
                >
                  {tag}
                </Text>
              </View>
            ))}
            {host.tags.length > 4 ? (
              <Text className="text-[9px] text-muted-foreground/40">
                +{host.tags.length - 4}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
