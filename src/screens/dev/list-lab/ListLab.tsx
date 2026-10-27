// List lab: the real host and file lists on big fake data, with a frame time
// and memory readout. Dev builds only. Scroll and fling while it measures.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUiColors } from "@/contexts/ThemeContext";
import { describeStartup } from "@/core/perf/marks";
import { FileList } from "@/features/file-manager/list/FileList";
import { sortEntries } from "@/features/file-manager/utils/fileUtils";
import { FrameMonitor } from "@/modules/termix-frame-monitor";
import { HostList } from "@/screens/hosts/navigation/HostList";
import {
  buildHostTree,
  collectFolderPaths,
  flattenTree,
  sortHostTree,
  type HostStatus,
} from "@/screens/hosts/navigation/hostTree";
import { round1, summarizeFrames } from "@/screens/dev/terminal-lab/metrics";
import { Text } from "@/ui";
import { bigFileList, bigHostList } from "./fixtures";

type Scene = "hosts" | "files";
const MEASURE_SECONDS = 10;
const NO_SELECTION = new Set<number>();
const NO_FILES = new Set<string>();
const noop = () => {};

/** Flips some statuses every 2 s, like the phone's own status checks. */
function useChurningStatuses(ids: number[]) {
  const [statuses, setStatuses] = useState<Map<number, HostStatus>>(
    () => new Map(ids.map((id) => [id, id % 3 ? "online" : "offline"])),
  );
  useEffect(() => {
    const timer = setInterval(() => {
      setStatuses((prev) => {
        const next = new Map(prev);
        for (let i = 0; i < 50; i++) {
          const id = ids[Math.floor(Math.random() * ids.length)];
          next.set(id, next.get(id) === "online" ? "offline" : "online");
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [ids]);
  return useCallback(
    (id: number): HostStatus => statuses.get(id) ?? "unknown",
    [statuses],
  );
}

function HostsScene() {
  const hosts = useMemo(() => bigHostList(2000), []);
  const ids = useMemo(() => hosts.map((h) => h.id), [hosts]);
  const getHostStatus = useChurningStatuses(ids);
  const tree = useMemo(() => buildHostTree(hosts), [hosts]);
  const expanded = useMemo(() => new Set(collectFolderPaths(tree)), [tree]);
  const rows = useMemo(
    () => flattenTree(sortHostTree(tree, "default", getHostStatus), expanded),
    [tree, expanded, getHostStatus],
  );
  const getHostMetrics = useCallback(() => undefined, []);
  return (
    <HostList
      rows={rows}
      getHostStatus={getHostStatus}
      getHostMetrics={getHostMetrics}
      onToggleFolder={noop}
      onToggleHost={noop}
      onHostPress={noop}
      onHostLongPress={noop}
      selecting={false}
      selected={NO_SELECTION}
      reorder={false}
      onReorder={noop}
      onRefusedDrop={noop}
    />
  );
}

function FilesScene() {
  const files = useMemo(() => sortEntries(bigFileList(20000)), []);
  return (
    <FileList
      path="/var/data"
      files={files}
      selected={NO_FILES}
      selecting={false}
      refreshing={false}
      onRefresh={noop}
      onPress={noop}
      onLongPress={noop}
      onMenu={noop}
    />
  );
}

export default function ListLab() {
  const ui = useUiColors();
  const insets = useSafeAreaInsets();
  const [scene, setScene] = useState<Scene>("hosts");
  const [status, setStatus] = useState("Pick a list, tap Measure, then fling.");

  const measure = async () => {
    if (!FrameMonitor) {
      setStatus("The frame monitor is not in this build.");
      return;
    }
    const monitor = FrameMonitor;
    setStatus(`Measuring for ${MEASURE_SECONDS} s, keep scrolling...`);
    const memStart = (await monitor.memory()).residentMb;
    await monitor.start();
    await new Promise((r) => setTimeout(r, MEASURE_SECONDS * 1000));
    const frames = await monitor.stop();
    const memEnd = (await monitor.memory()).residentMb;
    const s = summarizeFrames(frames.intervalsMs, monitor.refreshRate());
    const line =
      `${scene} | ${round1(s.fps)} fps | p95 ${round1(s.p95)} ms | ` +
      `dropped ${s.dropped}/${s.frames} | mem ${round1(memStart)} to ${round1(memEnd)} MB`;
    monitor.log(`list-lab ${line}`);
    setStatus(line);
  };

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        backgroundColor: ui.background,
      }}
    >
      <View className="flex-row gap-2 px-3 py-2">
        {(["hosts", "files"] as const).map((id) => (
          <Pressable
            key={id}
            onPress={() => setScene(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: scene === id }}
            className={`border px-3 py-1.5 ${scene === id ? "border-accent-brand" : "border-border"}`}
          >
            <Text className="text-xs text-foreground">
              {id === "hosts" ? "Hosts 2,000" : "Files 20,000"}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => void measure()}
          accessibilityRole="button"
          className="border border-border px-3 py-1.5"
        >
          <Text className="text-xs text-foreground">Measure</Text>
        </Pressable>
      </View>
      <Text className="px-3 text-xs text-muted-foreground">{status}</Text>
      <Text className="px-3 pb-2 text-xs text-muted-foreground">
        Startup: {describeStartup() || "not measured"}
      </Text>
      <View style={{ flex: 1 }}>
        {scene === "hosts" ? <HostsScene /> : <FilesScene />}
      </View>
    </View>
  );
}
