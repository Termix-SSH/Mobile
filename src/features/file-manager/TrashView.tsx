import { useCallback, useEffect, useState } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import {
  Trash2,
  RotateCcw,
  Folder as FolderIcon,
  File as FileIcon,
} from "lucide-react-native";
import { Sheet, SheetBody, Button, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import {
  formatFileSize,
  formatDate,
  getFileIconColor,
} from "./utils/fileUtils";
import type { TrashItem } from "@/core/api/types";
import type { TrashApi } from "./backend/types";

/**
 * Deleted files go to the host's trash rather than away, so this lists them
 * and allows restoring or deleting them for good.
 */
export function TrashView({
  visible,
  trash,
  onClose,
  onRestored,
}: {
  visible: boolean;
  trash: TrashApi;
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
      const res = await trash.list();
      setItems(res.items);
      setRetentionDays(res.retentionDays);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load trash");
    } finally {
      setLoading(false);
    }
  }, [trash]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const restore = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await trash.restore(item.id);
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
      await trash.remove(item.id);
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
      await trash.empty();
      setItems([]);
      toast.success("Trash emptied");
    } catch (e: any) {
      toast.error(e?.message || "Failed to empty trash");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      scroll
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
      <SheetBody>
        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator color={color("muted-foreground")} />
          </View>
        ) : items.length === 0 ? (
          <Text className="py-6 text-center text-sm text-muted-foreground">
            Trash is empty
          </Text>
        ) : (
          <View>
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
                    {item.isDirectory ? "" : ` | ${formatFileSize(item.size)}`}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Restore ${item.name}`}
                  onPress={() => restore(item)}
                  disabled={busyId === item.id}
                  hitSlop={6}
                  className="border border-border p-2 active:bg-muted/40"
                >
                  <RotateCcw size={15} color={color("foreground")} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.name} for good`}
                  onPress={() => purge(item)}
                  disabled={busyId === item.id}
                  hitSlop={6}
                  className="border border-destructive/40 p-2 active:bg-destructive/10"
                >
                  <Trash2 size={15} color={color("destructive")} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </SheetBody>
    </Sheet>
  );
}
