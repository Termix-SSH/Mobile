import { useSyncExternalStore } from "react";
import { FlatList, Pressable, View } from "react-native";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderOpen,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react-native";
import { Button, EmptyState, InlineView, Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import { formatFileSize } from "../utils/fileUtils";
import type { TransferManager } from "./manager";
import { isActive, summarize, type Transfer } from "./queue";

export function useTransfers(manager: TransferManager | null): Transfer[] {
  return useSyncExternalStore(
    manager?.subscribe ?? noopSubscribe,
    manager?.getSnapshot ?? emptySnapshot,
    manager?.getSnapshot ?? emptySnapshot,
  );
}

const EMPTY: Transfer[] = [];
const emptySnapshot = () => EMPTY;
const noopSubscribe = () => () => {};

const STATE_LABEL: Record<Transfer["state"], string> = {
  queued: "Waiting",
  running: "",
  paused: "Paused",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

function percent(t: Transfer) {
  if (t.total <= 0) return t.state === "done" ? 100 : 0;
  return Math.min(100, Math.round((t.done / t.total) * 100));
}

function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-9 w-9 items-center justify-center border border-border active:bg-muted"
    >
      {children}
    </Pressable>
  );
}

function Row({
  t,
  manager,
  onOpen,
}: {
  t: Transfer;
  manager: TransferManager;
  onOpen?: (t: Transfer) => void;
}) {
  const colors = useUiColors();
  const pct = percent(t);
  const sizeText =
    t.total > 0
      ? `${formatFileSize(t.done)} of ${formatFileSize(t.total)}`
      : formatFileSize(t.done);
  const status = STATE_LABEL[t.state];
  return (
    <View className="gap-1.5 border-b border-border/40 px-3 py-2.5">
      <View className="flex-row items-center gap-2">
        {t.kind === "download" ? (
          <ArrowDownToLine size={15} color={colors.textMuted} />
        ) : (
          <ArrowUpFromLine size={15} color={colors.textMuted} />
        )}
        <Text weight="bold" numberOfLines={1} className="flex-1 text-row">
          {t.name}
        </Text>
        {t.state === "running" || t.state === "queued" ? (
          <IconButton label="Pause" onPress={() => manager.pause(t.id)}>
            <Pause size={14} color={colors.text} />
          </IconButton>
        ) : null}
        {t.state === "paused" ? (
          <IconButton label="Resume" onPress={() => manager.resume(t.id)}>
            <Play size={14} color={colors.text} />
          </IconButton>
        ) : null}
        {t.state === "failed" || t.state === "cancelled" ? (
          <IconButton label="Try again" onPress={() => manager.retry(t.id)}>
            <RotateCcw size={14} color={colors.text} />
          </IconButton>
        ) : null}
        {t.state === "done" && t.kind === "download" && onOpen ? (
          <IconButton label="Open" onPress={() => onOpen(t)}>
            <FolderOpen size={14} color={colors.text} />
          </IconButton>
        ) : null}
        {isActive(t) ? (
          <IconButton label="Cancel" onPress={() => manager.cancel(t.id)}>
            <X size={14} color={colors.text} />
          </IconButton>
        ) : null}
      </View>
      <View className="h-1 bg-muted">
        <View
          className={
            t.state === "failed" ? "h-1 bg-destructive" : "h-1 bg-accent-brand"
          }
          style={{ width: `${pct}%` }}
        />
      </View>
      <Text numberOfLines={2} className="text-meta text-muted-foreground">
        {[
          status,
          sizeText,
          t.state === "running" && t.total > 0 ? `${pct}%` : "",
          t.error ?? "",
        ]
          .filter(Boolean)
          .join(" | ")}
      </Text>
    </View>
  );
}

/** Downloads and uploads of one files tab, newest last. */
export function TransfersPanel({
  open,
  manager,
  onClose,
  onOpen,
}: {
  open: boolean;
  manager: TransferManager;
  onClose: () => void;
  onOpen?: (t: Transfer) => void;
}) {
  const list = useTransfers(manager);
  const sum = summarize(list);
  const hasFinished = list.some((t) => !isActive(t));
  return (
    <InlineView
      open={open}
      onClose={onClose}
      title="Transfers"
      subtitle={
        sum.active
          ? `${sum.active} going | ${formatFileSize(sum.done)} of ${formatFileSize(sum.total)}`
          : undefined
      }
      bare
      scroll={false}
      footer={
        list.length ? (
          <View className="flex-row gap-2">
            <Button
              variant="muted"
              className="flex-1"
              disabled={!hasFinished}
              onPress={() => manager.clear()}
            >
              Clear finished
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!sum.active}
              onPress={() => manager.cancelAll()}
            >
              Cancel all
            </Button>
          </View>
        ) : undefined
      }
    >
      <FlatList
        data={list}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <Row t={item} manager={manager} onOpen={onOpen} />
        )}
        ListEmptyComponent={<EmptyState title="No transfers yet" />}
        contentContainerStyle={list.length ? undefined : { flexGrow: 1 }}
      />
    </InlineView>
  );
}
