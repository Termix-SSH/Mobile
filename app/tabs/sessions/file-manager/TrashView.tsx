import { useCallback, useEffect, useState } from "react";
import { View, Pressable, ScrollView, ActivityIndicator } from "react-native";
import {
  Trash2,
  RotateCcw,
  Folder as FolderIcon,
  File as FileIcon,
} from "lucide-react-native";
import { Dialog, Button, Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
import {
  listSSHTrash,
  restoreSSHTrashItem,
  deleteSSHTrashItem,
  emptySSHTrash,
  type TrashItem,
} from "@/app/main-axios";
import {
  formatFileSize,
  formatDate,
  getFileIconColor,
} from "./utils/fileUtils";

/**
 * Deleted files are moved to a server-side trash rather than removed, so this
 * lists them and allows restoring or permanently deleting.
 */
export function TrashView({
  visible,
  sessionId,
  onClose,
  onRestored,
}: {
  visible: boolean;
  sessionId: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const color = useThemeColor();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [retentionDays, setRetentionDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSSHTrash(sessionId);
      setItems(res.items);
      setRetentionDays(res.retentionDays);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load trash");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const restore = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await restoreSSHTrashItem(sessionId, item.id);
      toast.success(`Restored ${item.name}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onRestored();
    } catch (e: any) {
      toast.error(e?.message || "Failed to restore");
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await deleteSSHTrashItem(sessionId, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

  const empty = async () => {
    setLoading(true);
    try {
      await emptySSHTrash(sessionId);
      setItems([]);
      toast.success("Trash emptied");
    } catch (e: any) {
      toast.error(e?.message || "Failed to empty trash");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title="Trash"
      description={
        retentionDays > 0
          ? `Items are removed after ${retentionDays} days`
          : undefined
      }
      icon={<Trash2 size={18} color={color("foreground")} />}
      footer={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button variant="ghost" size="sm" onPress={onClose}>
            Close
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={items.length === 0 || loading}
            onPress={empty}
          >
            Empty Trash
          </Button>
        </View>
      }
    >
      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator color={color("muted-foreground")} />
        </View>
      ) : items.length === 0 ? (
        <Text className="py-6 text-center text-sm text-muted-foreground">
          Trash is empty
        </Text>
      ) : (
        <ScrollView style={{ maxHeight: 360 }}>
          {items.map((item) => (
            <View
              key={item.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 10,
              }}
            >
              {item.isDirectory ? (
                <FolderIcon
                  size={18}
                  color={getFileIconColor(item.name, "directory")}
                />
              ) : (
                <FileIcon
                  size={18}
                  color={getFileIconColor(item.name, "file")}
                />
              )}
              <View style={{ flex: 1 }}>
                <Text className="text-sm" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text
                  className="text-xs text-muted-foreground"
                  numberOfLines={1}
                >
                  {item.originalPath}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {formatDate(item.deletedAt)}
                  {item.isDirectory ? "" : ` · ${formatFileSize(item.size)}`}
                </Text>
              </View>
              <Pressable
                onPress={() => restore(item)}
                disabled={busyId === item.id}
                hitSlop={6}
                className="rounded border border-border p-2 active:bg-muted/40"
              >
                <RotateCcw size={15} color={color("foreground")} />
              </Pressable>
              <Pressable
                onPress={() => purge(item)}
                disabled={busyId === item.id}
                hitSlop={6}
                className="rounded border border-destructive/40 p-2 active:bg-destructive/10"
              >
                <Trash2 size={15} color={color("destructive")} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </Dialog>
  );
}
