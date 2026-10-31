import { useMemo, useSyncExternalStore } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { History } from "lucide-react-native";
import { Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import { suggestCommands, type CommandLineTracker } from "./capture";

/** Past commands that start with what is typed. Tapping one types the rest. */
export function SuggestionStrip({
  tracker,
  history,
  onPick,
}: {
  tracker: CommandLineTracker;
  history: string[];
  onPick: (rest: string) => void;
}) {
  const ui = useUiColors();
  const line = useSyncExternalStore(
    (l) => tracker.subscribe(l),
    () => tracker.current(),
  );
  const items = useMemo(() => suggestCommands(history, line), [history, line]);
  if (items.length === 0) return null;
  const typed = line.trimStart();
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        borderTopWidth: 1,
        borderColor: ui.border,
        backgroundColor: ui.card,
      }}
    >
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center" }}
      >
        <View style={{ paddingHorizontal: 8 }}>
          <History size={13} color={ui.textMuted} />
        </View>
        {items.map((command) => (
          <Pressable
            key={command}
            onPress={() => onPick(command.slice(typed.length))}
            accessibilityRole="button"
            accessibilityLabel={`Use ${command}`}
            style={{
              minHeight: 36,
              justifyContent: "center",
              paddingHorizontal: 10,
              borderLeftWidth: 1,
              borderColor: ui.border,
            }}
          >
            <Text className="text-xs text-foreground" numberOfLines={1}>
              <Text className="text-xs text-muted-foreground">{typed}</Text>
              {command.slice(typed.length)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
