import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  RefreshControl,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from "react-native";
import { useUiColors } from "@/contexts/ThemeContext";
import type { FileEntry } from "../backend/types";
import { textScale, useUiPrefs } from "@/core/ui-prefs";
import { FileRow, fileRowHeight } from "./FileRow";

const keyOf = (f: FileEntry) => f.path;

/**
 * A virtualized list with fixed row heights. The scroll spot is kept per
 * folder, so going back up lands where you were.
 */
export function FileList({
  path,
  files,
  selected,
  selecting,
  refreshing,
  onRefresh,
  onPress,
  onLongPress,
  onMenu,
  empty,
}: {
  path: string;
  files: FileEntry[];
  selected: Set<string>;
  selecting: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onPress: (file: FileEntry) => void;
  onLongPress: (file: FileEntry) => void;
  onMenu: (file: FileEntry) => void;
  empty?: React.ReactElement | null;
}) {
  const colors = useUiColors();
  const { fontScale } = useWindowDimensions();
  const { textSize } = useUiPrefs();
  const height = fileRowHeight(fontScale, textScale(textSize));
  const itemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: height,
      offset: height * index,
      index,
    }),
    [height],
  );
  const list = useRef<FlatList<FileEntry>>(null);
  const offsets = useRef(new Map<string, number>());
  const pathRef = useRef(path);

  useEffect(() => {
    pathRef.current = path;
    const saved = offsets.current.get(path) ?? 0;
    // Wait a frame so the new rows are laid out before scrolling.
    const frame = requestAnimationFrame(() =>
      list.current?.scrollToOffset({ offset: saved, animated: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [path, files.length]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsets.current.set(pathRef.current, e.nativeEvent.contentOffset.y);
  }, []);

  const rowColors = useMemo(
    () => ({ muted: colors.textMuted, brand: colors.brand }),
    [colors.textMuted, colors.brand],
  );

  const renderItem = useCallback<ListRenderItem<FileEntry>>(
    ({ item, index }) => (
      <FileRow
        file={item}
        index={index}
        selecting={selecting}
        selected={selected.has(item.path)}
        colors={rowColors}
        height={height}
        onPress={onPress}
        onLongPress={onLongPress}
        onMenu={onMenu}
      />
    ),
    [selecting, selected, rowColors, height, onPress, onLongPress, onMenu],
  );

  return (
    <FlatList
      ref={list}
      data={files}
      keyExtractor={keyOf}
      extraData={`${selecting}:${selected.size}:${colors.brand}`}
      getItemLayout={itemLayout}
      initialNumToRender={20}
      maxToRenderPerBatch={30}
      windowSize={11}
      removeClippedSubviews
      onScroll={onScroll}
      scrollEventThrottle={64}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={empty}
      contentContainerStyle={files.length ? undefined : { flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.textMuted}
        />
      }
      renderItem={renderItem}
    />
  );
}
