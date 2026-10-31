import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Search, X } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { useLiveList, useRepositories } from "@/core/data/hooks";
import type { ToolDef } from "@/core/features";
import { HostPicker } from "@/screens/tools/HostPicker";
import { EmptyState, InlineView, Input, ListRow, Text } from "@/ui";
import { rankPalette, SECTION_TITLES } from "./search";
import { palette, usePaletteOpen } from "./store";
import { usePaletteItems } from "./usePaletteItems";

/** Search hosts, snippets, actions and settings from any screen. */
export function CommandPalette() {
  const open = usePaletteOpen();
  if (!open) return null;
  return <PaletteView />;
}

function PaletteView() {
  const color = useThemeColor();
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState<ToolDef | null>(null);
  const close = useCallback(() => palette.close(), []);
  const items = usePaletteItems({ close, pickHost: setTool });
  const groups = useMemo(() => rankPalette(items, query), [items, query]);

  return (
    <>
      <InlineView
        open
        onClose={close}
        bare
        title={
          <Input
            autoFocus
            placeholder="Search hosts, snippets, actions"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => groups[0]?.items[0]?.run()}
            leading={<Search size={15} color={color("muted-foreground")} />}
            trailing={
              query ? (
                <Pressable
                  onPress={() => setQuery("")}
                  hitSlop={8}
                  accessibilityLabel="Clear search"
                >
                  <X size={15} color={color("muted-foreground")} />
                </Pressable>
              ) : undefined
            }
          />
        }
      >
        {groups.length === 0 ? (
          <EmptyState
            icon={Search}
            title={query ? "Nothing matches" : "Type to search"}
            hint={
              query
                ? undefined
                : "Find a host to connect, a snippet, a setting or an action."
            }
          />
        ) : (
          <View className="gap-4 p-3">
            {groups.map((group) => (
              <View key={group.section} className="gap-1.5">
                <Text
                  weight="medium"
                  className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground"
                >
                  {query
                    ? SECTION_TITLES[group.section]
                    : `Suggested | ${SECTION_TITLES[group.section]}`}
                </Text>
                <View className="border border-border">
                  {group.items.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <ListRow
                        key={item.id}
                        index={index}
                        title={item.label}
                        icon={
                          Icon ? (
                            <Icon size={16} color={color("muted-foreground")} />
                          ) : undefined
                        }
                        meta={
                          item.detail ? (
                            <Text
                              className="text-meta text-muted-foreground"
                              numberOfLines={1}
                            >
                              {item.detail}
                            </Text>
                          ) : undefined
                        }
                        onPress={item.run}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </InlineView>
      <ToolHostPicker tool={tool} onDone={() => setTool(null)} close={close} />
    </>
  );
}

function ToolHostPicker({
  tool,
  onDone,
  close,
}: {
  tool: ToolDef | null;
  onDone: () => void;
  close: () => void;
}) {
  const repos = useRepositories();
  const hosts = useLiveList(repos.hosts, () => repos.hosts.list(), [repos]);
  const { navigateToSessions } = useTerminalSessions();
  const pickable = useMemo(
    () => (tool ? hosts.data.filter((h) => tool.isAvailable?.(h) ?? true) : []),
    [tool, hosts.data],
  );
  return (
    <HostPicker
      visible={tool !== null}
      title={tool?.label ?? ""}
      hosts={pickable}
      onClose={onDone}
      onPick={(host) => {
        const type = tool?.tabType;
        onDone();
        close();
        if (type) void navigateToSessions(host, type);
      }}
    />
  );
}
