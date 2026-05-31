import { useCallback, useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Container,
  Play,
  Square,
  RotateCcw,
  Trash2,
  FileText,
  X,
} from "lucide-react-native";
import { SSHHost } from "@/types";
import {
  getDockerContainers,
  dockerContainerAction,
  getDockerContainerLogs,
  type DockerContainer,
} from "@/app/main-axios";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { MONO_FONT } from "@/app/constants/fonts";
import { toast } from "@/app/utils/toast";

interface DockerProps {
  host: SSHHost;
  isVisible: boolean;
}

export function Docker({ host, isVisible }: DockerProps) {
  const color = useThemeColor();
  const insets = useSafeAreaInsets();
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ name: string; text: string } | null>(null);

  const load = useCallback(
    async (spinner = true) => {
      if (spinner) setLoading(true);
      try {
        const list = await getDockerContainers(host.id);
        setContainers(list);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load containers");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [host.id],
  );

  useEffect(() => {
    if (isVisible) load();
  }, [isVisible, load]);

  const act = async (
    c: DockerContainer,
    action: "start" | "stop" | "restart" | "remove",
  ) => {
    setBusy(c.id);
    try {
      await dockerContainerAction(host.id, c.id, action);
      toast.success(`${action} ${c.name}`);
      await load(false);
    } catch (e: any) {
      toast.error(e?.message || `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  };

  const showLogs = async (c: DockerContainer) => {
    setLogs({ name: c.name, text: "Loading…" });
    try {
      const text = await getDockerContainerLogs(host.id, c.id);
      setLogs({ name: c.name, text: text || "(no output)" });
    } catch (e: any) {
      setLogs({ name: c.name, text: e?.message || "Failed to load logs" });
    }
  };

  if (!isVisible) return null;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {loading && containers.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={color("accent-brand")} />
          <Text className="mt-3 text-sm text-muted-foreground">
            Loading containers…
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(false);
              }}
              tintColor={color("accent-brand")}
            />
          }
        >
          {containers.length === 0 ? (
            <Text className="mt-12 text-center text-sm text-muted-foreground">
              No containers found
            </Text>
          ) : (
            containers.map((c) => {
              const running = /up|running/i.test(c.state || c.status || "");
              return (
                <View
                  key={c.id}
                  className="gap-2.5 border border-border bg-card px-3 py-3"
                >
                  <View className="flex-row items-center gap-2.5">
                    <View
                      style={{
                        backgroundColor: running
                          ? "#22c55e"
                          : (color("muted-foreground", 0.4) ?? "#555"),
                      }}
                      className="h-2.5 w-2.5 rounded-full"
                    />
                    <Container size={15} color={color("muted-foreground")} />
                    <View className="min-w-0 flex-1">
                      <Text
                        weight="medium"
                        className="text-sm text-foreground"
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                      <Text
                        className="text-[10px] text-muted-foreground"
                        numberOfLines={1}
                      >
                        {c.image} · {c.status}
                      </Text>
                    </View>
                    {busy === c.id ? (
                      <ActivityIndicator
                        size="small"
                        color={color("accent-brand")}
                      />
                    ) : null}
                  </View>
                  <View className="flex-row gap-1.5">
                    {running ? (
                      <DockerBtn
                        icon={<Square size={13} color={color("foreground")} />}
                        label="Stop"
                        onPress={() => act(c, "stop")}
                      />
                    ) : (
                      <DockerBtn
                        icon={<Play size={13} color={color("accent-brand")} />}
                        label="Start"
                        onPress={() => act(c, "start")}
                        accent
                      />
                    )}
                    <DockerBtn
                      icon={<RotateCcw size={13} color={color("foreground")} />}
                      label="Restart"
                      onPress={() => act(c, "restart")}
                    />
                    <DockerBtn
                      icon={<FileText size={13} color={color("foreground")} />}
                      label="Logs"
                      onPress={() => showLogs(c)}
                    />
                    <DockerBtn
                      icon={<Trash2 size={13} color={color("destructive")} />}
                      label="Remove"
                      onPress={() => act(c, "remove")}
                      destructive
                    />
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Logs viewer */}
      <Modal
        visible={logs !== null}
        animationType="slide"
        onRequestClose={() => setLogs(null)}
      >
        <View
          className="flex-1 bg-background"
          style={{ paddingTop: insets.top }}
        >
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Text
              weight="bold"
              className="text-base text-foreground"
              numberOfLines={1}
            >
              {logs?.name} logs
            </Text>
            <Pressable onPress={() => setLogs(null)} hitSlop={8}>
              <X size={18} color={color("foreground")} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12 }}>
            <Text
              className="text-[11px] text-muted-foreground"
              style={{ fontFamily: MONO_FONT }}
            >
              {logs?.text}
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function DockerBtn({
  icon,
  label,
  onPress,
  accent,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  accent?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1 border px-2 py-1.5 active:opacity-80 ${
        accent
          ? "border-accent-brand/40 bg-accent-brand/10"
          : destructive
            ? "border-destructive/40"
            : "border-border"
      }`}
    >
      {icon}
      <Text
        className={`text-[10px] ${accent ? "text-accent-brand" : destructive ? "text-destructive" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
