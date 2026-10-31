import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  Copy,
  Play,
  Search,
  Trash2,
  TextCursorInput,
} from "lucide-react-native";
import { Button, Input, Sheet, SheetRow, Text, useConfirm } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useLiveList, useSessionRepositories } from "@/core/data/hooks";
import type { KeyboardTabProps } from "@/core/features/types";
import { showToast } from "@/utils/toast";
import { filterHistory } from "./filter";

/**
 * The active host's past commands. Tap types one in without running it, so
 * it can be edited first; long press to run, copy or delete.
 */
export default function HistoryBar({
  terminalRef,
  host,
  isVisible,
}: KeyboardTabProps) {
  const history = useSessionRepositories().commandHistory;
  const color = useThemeColor();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const list = useLiveList(
    history,
    async () => (host && host.id > 0 ? history.list(host) : []),
    [history, host],
  );
  const shown = useMemo(
    () => filterHistory(list.data, query),
    [list.data, query],
  );

  if (!isVisible) return null;

  const type = (command: string, run: boolean) =>
    terminalRef.current?.sendInput(run ? `${command}\r` : command);

  const clearAll = async () => {
    if (!host) return;
    const ok = await confirm({
      title: "Clear history for this host?",
      confirmLabel: "Clear",
    });
    if (!ok) return;
    await history.clear(host).catch(() => {});
    showToast.success("History cleared");
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        <Input
          size="sm"
          containerClassName="flex-1"
          value={query}
          onChangeText={setQuery}
          placeholder="Search history"
          autoCapitalize="none"
          autoCorrect={false}
          leading={<Search size={14} color={color("muted-foreground")} />}
        />
        {list.data.length > 0 ? (
          <Button variant="ghost" size="sm" onPress={clearAll}>
            Clear
          </Button>
        ) : null}
      </View>
      {list.loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={color("accent-brand")} />
        </View>
      ) : (
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          {shown.map((command) => (
            <Pressable
              key={command}
              onPress={() => type(command, false)}
              onLongPress={() => setMenu(command)}
              accessibilityRole="button"
              accessibilityHint="Types the command without running it"
              className="min-h-11 justify-center border-b border-border/40 px-3 py-2 active:bg-muted/50"
            >
              <Text className="text-row text-foreground" numberOfLines={2}>
                {command}
              </Text>
            </Pressable>
          ))}
          {shown.length === 0 ? (
            <View className="items-center px-6 py-8">
              <Text weight="medium" className="text-sm text-muted-foreground">
                {query ? "No commands match" : "No history yet"}
              </Text>
              {!query ? (
                <Text className="mt-1 text-center text-xs text-muted-foreground">
                  Commands you run on this host show up here
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      )}

      <Sheet
        visible={menu !== null}
        onClose={() => setMenu(null)}
        title={menu ?? undefined}
      >
        {menu ? (
          <>
            <SheetRow
              icon={<Play size={16} color={color("foreground")} />}
              label="Run"
              onPress={() => {
                setMenu(null);
                type(menu, true);
              }}
            />
            <SheetRow
              icon={<TextCursorInput size={16} color={color("foreground")} />}
              label="Type without running"
              onPress={() => {
                setMenu(null);
                type(menu, false);
              }}
            />
            <SheetRow
              icon={<Copy size={16} color={color("foreground")} />}
              label="Copy"
              onPress={() => {
                setMenu(null);
                void Clipboard.setStringAsync(menu).then(() =>
                  showToast.success("Copied"),
                );
              }}
            />
            <SheetRow
              icon={<Trash2 size={16} color={color("destructive")} />}
              label="Delete"
              destructive
              onPress={() => {
                setMenu(null);
                if (host) void history.remove(host, menu).catch(() => {});
              }}
            />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
