import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react-native";
import { Input, Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import type {
  TerminalSearchOptions,
  TerminalSearchResult,
} from "@/modules/termix-terminal";

// Only Android's search knows these; iOS uses ghostty's plain text search.
const HAS_OPTIONS = Platform.OS === "android";

export function searchLabel(result: TerminalSearchResult, query: string) {
  if (!query) return "";
  if (result.total === 0) return "No results";
  return result.index >= 0
    ? `${result.index + 1} of ${result.total}`
    : `${result.total}`;
}

/** Find in the terminal: text, hit count, next and previous. */
export function SearchBar({
  result,
  onSearch,
  onStep,
  onClose,
}: {
  result: TerminalSearchResult;
  onSearch: (query: string, options: TerminalSearchOptions) => void;
  onStep: (forward: boolean) => void;
  onClose: () => void;
}) {
  const ui = useUiColors();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<TerminalSearchOptions>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef(onSearch);
  searchRef.current = onSearch;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => searchRef.current(query, options), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, options]);

  const toggle = (key: keyof TerminalSearchOptions, label: string) => {
    const on = !!options[key];
    return (
      <Pressable
        onPress={() => setOptions((o) => ({ ...o, [key]: !on }))}
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel={
          key === "caseSensitive"
            ? "Match case"
            : key === "wholeWord"
              ? "Whole word"
              : "Regular expression"
        }
        style={{
          minWidth: 32,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: on ? ui.brand : ui.border,
          backgroundColor: on ? `${ui.brand}26` : "transparent",
        }}
      >
        <Text
          className="text-[11px]"
          style={{ color: on ? ui.brand : ui.textMuted }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const iconButton = (
    label: string,
    icon: React.ReactNode,
    onPress: () => void,
  ) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon}
    </Pressable>
  );

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        borderBottomWidth: 1,
        borderColor: ui.border,
        backgroundColor: ui.card,
        paddingHorizontal: 8,
        paddingVertical: 6,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Input
          size="sm"
          containerClassName="flex-1"
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Find"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => onStep(true)}
          leading={<Search size={13} color={ui.textMuted} />}
          trailing={
            <Text className="text-meta text-muted-foreground">
              {searchLabel(result, query)}
            </Text>
          }
        />
        {iconButton("Previous", <ChevronUp size={18} color={ui.text} />, () =>
          onStep(false),
        )}
        {iconButton("Next", <ChevronDown size={18} color={ui.text} />, () =>
          onStep(true),
        )}
        {iconButton("Close find", <X size={18} color={ui.text} />, onClose)}
      </View>
      {HAS_OPTIONS ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {toggle("caseSensitive", "Aa")}
          {toggle("wholeWord", "W")}
          {toggle("regex", ".*")}
        </View>
      ) : null}
    </View>
  );
}
