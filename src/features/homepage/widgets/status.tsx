import { Pressable, View } from "react-native";
import { Dot } from "@/screens/home/HomeCard";
import { useHomeData } from "@/screens/home/HomeData";
import type { SSHHost } from "@/types";
import { ListRow, Text } from "@/ui";
import {
  bool,
  Empty,
  list,
  num,
  PingDot,
  str,
  usePings,
  type WidgetProps,
} from "./shared";

export function PingStatusWidget(props: WidgetProps) {
  const urls = list<{ label?: unknown; url?: unknown }>(
    props.item.config.urls,
  ).filter((u) => typeof u.url === "string");
  const pings = usePings(
    props.client,
    urls.map((u) => str(u.url)),
    props,
  );
  const latency = bool(props.item.config.showLatency, true);
  if (urls.length === 0) return <Empty>No URLs yet.</Empty>;
  return (
    <View>
      {urls.map((u, index) => {
        const url = str(u.url);
        const result = pings[url];
        return (
          <ListRow
            key={`${url}:${index}`}
            index={index}
            title={str(u.label) || url}
            icon={<PingDot result={result} />}
            trailing={
              latency && result ? (
                <Text className="text-meta text-muted-foreground">
                  {result.ok ? `${result.latencyMs} ms` : "Down"}
                </Text>
              ) : undefined
            }
          />
        );
      })}
    </View>
  );
}

/** App hosts for the server host ids a widget saved, in that order. */
export function hostsFor(ids: unknown[], hosts: SSHHost[]): SSHHost[] {
  return ids.flatMap((id) => {
    if (typeof id !== "number") return [];
    const host = hosts.find((h) => (h.serverId ?? h.id) === id);
    return host ? [host] : [];
  });
}

function HostRows({ hosts }: { hosts: SSHHost[] }) {
  const { statuses, openHost, showHostMenu } = useHomeData();
  if (hosts.length === 0) return <Empty>No hosts picked.</Empty>;
  return (
    <View>
      {hosts.map((host, index) => (
        <ListRow
          key={host.id}
          index={index}
          title={host.name || host.ip}
          icon={<Dot state={statuses[host.id] ?? "unknown"} />}
          meta={
            <Text className="text-meta text-muted-foreground">
              {host.username ? `${host.username}@` : ""}
              {host.ip}
            </Text>
          }
          onPress={() => openHost(host)}
          onLongPress={() => showHostMenu(host)}
        />
      ))}
    </View>
  );
}

export function HostStatusWidget({ item }: WidgetProps) {
  const { hosts } = useHomeData();
  return <HostRows hosts={hostsFor([item.config.hostId], hosts)} />;
}

export function QuickConnectWidget({ item }: WidgetProps) {
  const { hosts } = useHomeData();
  const ids = Array.isArray(item.config.hostIds) ? item.config.hostIds : [];
  return <HostRows hosts={hostsFor(ids, hosts)} />;
}

export function HostGridWidget({ item }: WidgetProps) {
  const { hosts, statuses, openHost, showHostMenu } = useHomeData();
  const ids = Array.isArray(item.config.hostIds) ? item.config.hostIds : [];
  const picked = hostsFor(ids, hosts);
  const showIp = bool(item.config.showIp, true);
  if (picked.length === 0) return <Empty>No hosts picked.</Empty>;
  const cols = Math.min(Math.max(num(item.config.columns, 3), 2), 3);
  const width = `${100 / cols}%` as const;
  return (
    <View className="flex-row flex-wrap p-1.5">
      {picked.map((host) => (
        <View key={host.id} style={{ width }} className="p-1.5">
          <Pressable
            onPress={() => openHost(host)}
            onLongPress={() => showHostMenu(host)}
            accessibilityRole="button"
            accessibilityLabel={host.name || host.ip}
            className="gap-1 border border-border bg-background px-2 py-2 active:bg-muted/40"
          >
            <View className="flex-row items-center gap-1.5">
              <Dot state={statuses[host.id] ?? "unknown"} />
              <Text
                className="flex-1 text-[12px] text-foreground"
                numberOfLines={1}
              >
                {host.name || host.ip}
              </Text>
            </View>
            {showIp ? (
              <Text
                className="text-[10px] text-muted-foreground"
                numberOfLines={1}
              >
                {host.ip}
              </Text>
            ) : null}
          </Pressable>
        </View>
      ))}
    </View>
  );
}
