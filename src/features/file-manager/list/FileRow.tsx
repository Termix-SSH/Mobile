import { memo } from "react";
import { Pressable, View } from "react-native";
import {
  CheckSquare,
  File as FileIcon,
  Folder,
  FolderSymlink,
  Link as LinkIcon,
  MoreVertical,
  Square,
} from "lucide-react-native";
import { Text } from "@/ui";
import { MAX_FONT_SCALE } from "@/ui/Text";
import type { FileEntry } from "../backend/types";
import {
  formatDate,
  formatFileSize,
  getFileIconColor,
  modeText,
} from "../utils/fileUtils";

/** Every row is this tall at normal text size, so the list can jump to any row. */
export const ROW_HEIGHT = 56;
// The two text lines take this much of a row; the rest is padding.
const TEXT_PART = 34;

/** The row height for the system text size and the app's own, so big text fits. */
export function fileRowHeight(fontScale: number, appScale = 1): number {
  const scale = Math.max(1, Math.min(fontScale, MAX_FONT_SCALE)) * appScale;
  return Math.max(ROW_HEIGHT, Math.round(ROW_HEIGHT + TEXT_PART * (scale - 1)));
}

const LONG_PRESS_ACTIONS = [{ name: "longpress", label: "More actions" }];

export const isFolderLike = (f: FileEntry) =>
  f.type === "directory" || (f.type === "link" && f.targetType === "directory");

export function rowMeta(file: FileEntry): string {
  const parts: string[] = [];
  if (!isFolderLike(file)) parts.push(formatFileSize(file.size));
  const date = formatDate(file.mtime);
  if (date) parts.push(date);
  const mode = modeText(file.mode).symbolic;
  if (mode) parts.push(mode);
  if (file.owner) parts.push(file.owner);
  return parts.join(" | ");
}

export const FileRow = memo(function FileRow({
  file,
  index,
  selecting,
  selected,
  colors,
  height = ROW_HEIGHT,
  onPress,
  onLongPress,
  onMenu,
}: {
  file: FileEntry;
  index: number;
  selecting: boolean;
  selected: boolean;
  colors: { muted: string; brand: string };
  height?: number;
  onPress: (file: FileEntry) => void;
  onLongPress: (file: FileEntry) => void;
  onMenu: (file: FileEntry) => void;
}) {
  const iconColor = getFileIconColor(
    file.name,
    file.type === "link" && file.targetType === "directory"
      ? "directory"
      : file.type,
  );
  const Icon =
    file.type === "directory"
      ? Folder
      : file.type === "link"
        ? file.targetType === "directory"
          ? FolderSymlink
          : LinkIcon
        : FileIcon;
  const zebra = selected
    ? "bg-accent-brand/10"
    : index % 2 === 1
      ? "bg-muted/15"
      : "";
  return (
    <Pressable
      onPress={() => onPress(file)}
      onLongPress={() => onLongPress(file)}
      accessibilityRole="button"
      accessibilityActions={LONG_PRESS_ACTIONS}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "longpress") onLongPress(file);
      }}
      accessibilityLabel={file.name}
      accessibilityState={{ selected }}
      style={{ height }}
      className={`flex-row items-center border-b border-border/40 active:bg-muted/50 ${zebra}`}
    >
      <View className={`h-full w-[3px] ${selected ? "bg-accent-brand" : ""}`} />
      {selecting ? (
        <View className="pl-2.5">
          {selected ? (
            <CheckSquare size={18} color={colors.brand} />
          ) : (
            <Square size={18} color={colors.muted} />
          )}
        </View>
      ) : null}
      <View className="pl-2.5">
        <Icon size={20} color={iconColor} />
      </View>
      <View className="min-w-0 flex-1 justify-center gap-0.5 px-2.5">
        <Text
          weight="bold"
          numberOfLines={1}
          className="text-row text-foreground"
        >
          {file.name}
          {file.type === "link" && file.linkTarget ? (
            <Text className="text-meta text-muted-foreground">
              {"  -> "}
              {file.linkTarget}
            </Text>
          ) : null}
        </Text>
        <Text numberOfLines={1} className="text-meta text-muted-foreground">
          {rowMeta(file)}
        </Text>
      </View>
      {!selecting ? (
        <Pressable
          onPress={() => onMenu(file)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`More for ${file.name}`}
          className="h-full w-11 items-center justify-center active:bg-muted"
        >
          <MoreVertical size={16} color={colors.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
});
