import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button, EmptyState, InlineView, Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import { toUserMessage } from "@/core/errors";
import type { FileBackend, FileEntry } from "./backend/types";
import { Breadcrumbs } from "./list/Breadcrumbs";
import { FileList } from "./list/FileList";
import { isFolderLike } from "./list/FileRow";
import { sortEntries } from "./utils/fileUtils";

/** Browse folders only and pick one, for move, copy and files shared in. */
export function DestinationPicker({
  open,
  title,
  confirmLabel,
  backend,
  startPath,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  backend: FileBackend;
  startPath: string;
  onClose: () => void;
  onPick: (path: string) => void;
}) {
  const colors = useUiColors();
  const [path, setPath] = useState(startPath);
  const [folders, setFolders] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (target: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await backend.list(target);
        setPath(res.path);
        setFolders(sortEntries(res.files.filter(isFolderLike)));
      } catch (e) {
        setError(toUserMessage(e, "Could not open this folder"));
      } finally {
        setLoading(false);
      }
    },
    [backend],
  );

  useEffect(() => {
    if (open) void load(startPath);
  }, [open, startPath, load]);

  return (
    <InlineView
      open={open}
      onClose={onClose}
      title={title}
      subtitle={path}
      bare
      scroll={false}
      footer={
        <View className="flex-row gap-2">
          <Button variant="muted" className="flex-1" onPress={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={loading || !!error}
            onPress={() => onPick(path)}
          >
            {confirmLabel}
          </Button>
        </View>
      }
    >
      <Breadcrumbs path={path} onNavigate={(p) => void load(p)} />
      {loading && !folders.length ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-sm text-destructive-text">
            {error}
          </Text>
        </View>
      ) : (
        <FileList
          path={path}
          files={folders}
          selected={new Set()}
          selecting={false}
          refreshing={false}
          onRefresh={() => void load(path)}
          onPress={(f) => void load(f.path)}
          onLongPress={(f) => void load(f.path)}
          onMenu={(f) => void load(f.path)}
          empty={<EmptyState title="No folders here" />}
        />
      )}
    </InlineView>
  );
}
