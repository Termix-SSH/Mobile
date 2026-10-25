import { memo } from "react";
import { View, Pressable } from "react-native";
import { Pin, Cpu, MemoryStick, GripVertical } from "lucide-react-native";
import { SSHHost } from "@/types";
import {
  Checkbox,
  LookIcon,
  Text,
  isLookColor,
  lookIcon,
  useContextMenu,
} from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { HostBadgeDef } from "@/core/features";
import { isSshActive } from "@/utils/hosts";
import type { HostStatus } from "@/screens/hosts/navigation/hostTree";

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
  /** Folder depth, for the indent. */
  depth?: number;
  onPress: (host: SSHHost) => void;
  onLongPress?: (host: SSHHost) => void;
  /** Multi select is on: rows show a checkbox. */
  selecting?: boolean;
  selected?: boolean;
  /** Reorder is on: the grip starts a drag. */
  onDrag?: () => void;
  dragging?: boolean;
  /** Feature badges, read once by the list. */
  badges: HostBadgeDef[];
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

function Host({
  host,
  status,
  metrics,
  showTags = true,
  striped = false,
  depth = 0,
  onPress,
  onLongPress,
  selecting = false,
  selected = false,
  onDrag,
  dragging = false,
  badges,
}: HostProps) {
  const color = useThemeColor();
  const accent = color("accent-brand") ?? "#f59145";
  const online = status === "online";
  const rightClick = useContextMenu(
    selecting
      ? []
      : [
          { id: "open", label: "Open", onPress: () => onPress(host) },
          ...(onLongPress
            ? [
                {
                  id: "more",
                  label: "More actions",
                  onPress: () => onLongPress(host),
                },
              ]
            : []),
        ],
  );

  const sshActive = isSshActive(host);
  const protocols: string[] = [];
  if (sshActive) protocols.push("SSH");
  for (const badge of badges) {
    if (badge.show(host, sshActive)) protocols.push(badge.label);
  }

  const showCpu = online && metrics?.cpu != null && metrics.cpu > 0;
  const showRam = online && metrics?.ram != null && metrics.ram > 0;

  return (
    <Pressable
      {...rightClick.triggerProps}
      onPress={() => onPress(host)}
      onLongPress={onLongPress ? () => onLongPress(host) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${host.name}, ${status}`}
      accessibilityHint={
        selecting ? undefined : "Opens the terminal. Hold for more."
      }
      accessibilityState={selecting ? { selected } : undefined}
      style={{ marginLeft: depth * 14 }}
      className={`flex-row items-stretch hover:bg-muted/30 active:bg-muted/40 ${
        dragging || selected
          ? "bg-muted/50"
          : striped
            ? "bg-muted/20"
            : "bg-card"
      }`}
    >
      {/* Status stripe */}
      <View
        style={{ backgroundColor: online ? accent : "transparent" }}
        className="w-[3px] shrink-0"
      />

      {selecting ? (
        <View className="justify-center pl-2.5">
          <Checkbox checked={selected} onChange={() => onPress(host)} />
        </View>
      ) : null}

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
          {lookIcon(host.icon) || isLookColor(host.color) ? (
            <LookIcon
              name={host.icon}
              size={12}
              color={
                isLookColor(host.color)
                  ? host.color
                  : (color("muted-foreground") ?? "#9ca3af")
              }
            />
          ) : null}
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

      {onDrag ? (
        <Pressable
          onPressIn={onDrag}
          accessibilityLabel={`Drag ${host.name}`}
          hitSlop={6}
          className="justify-center px-3"
        >
          <GripVertical size={16} color={color("muted-foreground")} />
        </Pressable>
      ) : null}
      {rightClick.menu}
    </Pressable>
  );
}

// Rows re-render only when their own host, status or metrics change.
export default memo(Host);
