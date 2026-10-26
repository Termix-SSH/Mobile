import { memo, useCallback, useMemo } from "react";
import {
  FlatList,
  Pressable,
  View,
  type ListRenderItem,
  type RefreshControlProps,
} from "react-native";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { ChevronRight, Folder as FolderIcon } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useHostBadges } from "@/core/features";
import type { SSHHost } from "@/types";
import { Text } from "@/ui";
import Host, { type HostMetrics } from "./Host";
import {
  folderCountMap,
  reorderInFolder,
  type GetHostStatus,
  type HostListRow,
} from "./hostTree";

const FolderRow = memo(function FolderRow({
  row,
  striped,
  total,
  online,
  onToggle,
}: {
  row: Extract<HostListRow, { kind: "folder" }>;
  striped: boolean;
  total: number;
  online: number;
  onToggle: (path: string) => void;
}) {
  const color = useThemeColor();
  const muted = color("muted-foreground") ?? "#9ca3af";
  const accent = color("accent-brand") ?? "#f59145";
  const { node, open } = row;
  return (
    <Pressable
      onPress={() => onToggle(node.path)}
      accessibilityRole="button"
      accessibilityLabel={`Folder ${node.name}, ${total} hosts`}
      accessibilityState={{ expanded: open }}
      style={{ marginLeft: row.depth * 14 }}
      className={`flex-row items-center gap-2 px-2 py-2 hover:bg-muted/30 active:bg-muted/40 ${
        striped ? "bg-muted/20" : ""
      }`}
    >
      <View
        style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
        className="shrink-0"
      >
        <ChevronRight size={13} color={color("muted-foreground", 0.6)} />
      </View>
      <FolderIcon
        size={14}
        color={node.color ?? (open ? accent : muted)}
        fill={node.color ? node.color : "transparent"}
      />
      <Text
        weight="bold"
        className="flex-1 text-[13px] text-foreground/80"
        numberOfLines={1}
      >
        {node.name}
      </Text>
      <Text className="text-[10px]">
        {online > 0 ? (
          <Text className="text-[10px] text-accent-text" weight="bold">
            {online}
          </Text>
        ) : null}
        <Text className="text-[10px] text-muted-foreground">/{total}</Text>
      </Text>
    </Pressable>
  );
});

const keyOf = (row: HostListRow) => row.key;

/**
 * The host tree as one list. Folders open and close in place; in reorder
 * mode the grip drags a host inside its folder.
 */
export function HostList({
  rows,
  getHostStatus,
  getHostMetrics,
  onToggleFolder,
  onHostPress,
  onHostLongPress,
  selecting,
  selected,
  reorder,
  onReorder,
  onRefusedDrop,
  refreshControl,
  header,
  empty,
}: {
  rows: HostListRow[];
  getHostStatus: GetHostStatus;
  getHostMetrics: (id: number) => HostMetrics | undefined;
  onToggleFolder: (path: string) => void;
  onHostPress: (host: SSHHost) => void;
  onHostLongPress: (host: SSHHost) => void;
  selecting: boolean;
  selected: Set<number>;
  reorder: boolean;
  onReorder: (positions: { id: number; sortOrder: number }[]) => void;
  onRefusedDrop: () => void;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  header?: React.ReactElement;
  empty?: React.ReactElement;
}) {
  const badges = useHostBadges();
  // Counted once per change, not once per folder row per render.
  const counts = useMemo(
    () =>
      folderCountMap(
        rows.flatMap((r) =>
          r.kind === "folder" && r.depth === 0 ? [r.node] : [],
        ),
        getHostStatus,
      ),
    [rows, getHostStatus],
  );

  const renderRow = useCallback(
    (item: HostListRow, index: number, drag?: () => void, isActive = false) => {
      const striped = index % 2 === 1;
      if (item.kind === "folder") {
        const c = counts.get(item.node.path);
        return (
          <FolderRow
            row={item}
            striped={striped}
            total={c?.total ?? 0}
            online={c?.online ?? 0}
            onToggle={onToggleFolder}
          />
        );
      }
      return (
        <Host
          host={item.host}
          depth={item.depth}
          status={getHostStatus(item.host.id)}
          metrics={getHostMetrics(item.host.id)}
          striped={striped}
          onPress={onHostPress}
          onLongPress={selecting || reorder ? undefined : onHostLongPress}
          selecting={selecting}
          selected={selected.has(item.host.id)}
          onDrag={reorder ? drag : undefined}
          dragging={isActive}
          badges={badges}
        />
      );
    },
    [
      badges,
      counts,
      getHostMetrics,
      getHostStatus,
      onHostLongPress,
      onHostPress,
      onToggleFolder,
      reorder,
      selected,
      selecting,
    ],
  );

  const renderDraggable = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<HostListRow>) =>
      renderRow(item, getIndex() ?? 0, drag, isActive),
    [renderRow],
  );
  const renderItem = useCallback<ListRenderItem<HostListRow>>(
    ({ item, index }) => renderRow(item, index),
    [renderRow],
  );

  // The drag list measures every row, so it is only used while reordering.
  if (!reorder) {
    return (
      <FlatList
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={9}
      />
    );
  }

  return (
    <DraggableFlatList
      data={rows}
      keyExtractor={keyOf}
      renderItem={renderDraggable}
      containerStyle={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 96 }}
      showsVerticalScrollIndicator={false}

      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      activationDistance={0}
      onDragEnd={({ data, from, to }) => {
        if (from === to) return;
        const positions = reorderInFolder(rows, data, rows[from].key);
        if (positions) onReorder(positions);
        else onRefusedDrop();
      }}
    />
  );
}
