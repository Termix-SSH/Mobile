import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Play,
  Search,
  StickyNote,
} from "lucide-react-native";
import { Input, Sheet, SheetRow, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useLiveList, useSessionRepositories } from "@/core/data/hooks";
import type { KeyboardTabProps } from "@/core/features/types";
import type { Snippet } from "@/types";
import { showToast } from "@/utils/toast";
import { groupSnippets } from "./group";
import { snippetMode } from "./run";
import { useSnippetRunner } from "./useSnippetRunner";

/** Snippets inside the terminal's keyboard panel. Tap runs, long press for more. */
export default function SnippetsBar({
  terminalRef,
  host,
  isVisible,
}: KeyboardTabProps) {
  const repos = useSessionRepositories();
  const color = useThemeColor();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<Snippet | null>(null);
  const snippets = useLiveList(repos.snippets, () => repos.snippets.list(), [
    repos,
  ]);
  const folders = useLiveList(
    repos.snippetFolders,
    () => repos.snippetFolders.list(),
    [repos],
  );
  const getTerminal = useCallback(() => terminalRef.current, [terminalRef]);
  const runner = useSnippetRunner(getTerminal, host);

  const groups = useMemo(
    () => groupSnippets(snippets.data, folders.data, query),
    [snippets.data, folders.data, query],
  );

  if (!isVisible) return null;

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border px-3 py-2">
        <Input
          size="sm"
          value={query}
          onChangeText={setQuery}
          placeholder="Search snippets"
          autoCapitalize="none"
          autoCorrect={false}
          leading={<Search size={14} color={color("muted-foreground")} />}
        />
      </View>
      {snippets.loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={color("accent-brand")} />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 12 }}
        >
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key) && !query;
            const Chevron = isCollapsed ? ChevronRight : ChevronDown;
            return (
              <View key={group.key || "none"}>
                <Pressable
                  onPress={() => toggle(group.key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !isCollapsed }}
                  className="min-h-10 flex-row items-center gap-2 border-b border-l-2 border-b-border/40 bg-card px-3"
                  style={{
                    borderLeftColor: group.color || color("border"),
                  }}
                >
                  <Chevron size={13} color={color("muted-foreground")} />
                  <Text
                    weight="medium"
                    className="flex-1 text-xs text-foreground"
                    numberOfLines={1}
                  >
                    {group.label}
                  </Text>
                  <Text className="text-meta text-muted-foreground">
                    {group.items.length}
                  </Text>
                </Pressable>
                {isCollapsed
                  ? null
                  : group.items.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => runner.start(s)}
                        onLongPress={() => setMenu(s)}
                        accessibilityRole="button"
                        accessibilityHint={
                          s.isNote ? "Pastes the note" : "Runs the snippet"
                        }
                        className="min-h-11 flex-row items-center gap-2.5 border-b border-border/40 py-2 pl-8 pr-3 active:bg-muted/50"
                      >
                        {s.isNote ? (
                          <StickyNote
                            size={13}
                            color={color("muted-foreground")}
                          />
                        ) : (
                          <Play size={13} color={color("accent-brand")} />
                        )}
                        <View className="min-w-0 flex-1">
                          <Text
                            className="text-row text-foreground"
                            numberOfLines={1}
                          >
                            {s.name}
                          </Text>
                          <Text
                            className="text-meta text-muted-foreground"
                            numberOfLines={1}
                          >
                            {s.content}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
              </View>
            );
          })}
          {groups.length === 0 ? (
            <View className="items-center px-6 py-8">
              <Text weight="medium" className="text-sm text-muted-foreground">
                {query ? "No snippets match" : "No snippets yet"}
              </Text>
              {!query ? (
                <Text className="mt-1 text-center text-xs text-muted-foreground">
                  Add snippets in Settings, Snippets
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      )}

      <Sheet
        visible={menu !== null}
        onClose={() => setMenu(null)}
        title={menu?.name}
      >
        {menu ? (
          <>
            {snippetMode(menu) === "run" ? (
              <SheetRow
                icon={<Play size={16} color={color("foreground")} />}
                label="Run"
                onPress={() => {
                  setMenu(null);
                  runner.start(menu, "run");
                }}
              />
            ) : null}
            <SheetRow
              icon={<ClipboardPaste size={16} color={color("foreground")} />}
              label="Insert without running"
              onPress={() => {
                setMenu(null);
                runner.start(menu, "insert");
              }}
            />
            <SheetRow
              icon={<Copy size={16} color={color("foreground")} />}
              label="Copy"
              onPress={() => {
                setMenu(null);
                void Clipboard.setStringAsync(menu.content).then(() =>
                  showToast.success("Copied"),
                );
              }}
            />
          </>
        ) : null}
      </Sheet>
      {runner.sheet}
    </View>
  );
}
