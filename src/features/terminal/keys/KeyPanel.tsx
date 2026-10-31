import { ScrollView, View } from "react-native";
import { Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import type { TerminalInputHandle } from "@/core/features/types";
import type { SSHHost } from "@/types";
import { useKeyPrefs } from "./KeyPrefsContext";
import { KeyView } from "./KeyView";
import { useKeyLayout } from "./useKeyLayout";
import { useKeyPad } from "./useKeyPad";

/** Every row of the layout at once, in the keys panel. */
export default function KeyPanel({
  terminalRef,
  host,
  onCommand,
}: {
  terminalRef: React.RefObject<TerminalInputHandle | null>;
  host?: SSHHost | null;
  onCommand?: (id: string) => void;
}) {
  const ui = useUiColors();
  const { settings } = useKeyPrefs();
  const { layout } = useKeyLayout(host);
  const pad = useKeyPad(terminalRef, {
    tmuxPrefix: layout.tmuxPrefix,
    backspaceMode: host?.terminalConfig?.backspaceMode,
    onCommand,
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: ui.background }}
      contentContainerStyle={{ padding: 8, gap: 10 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {layout.rows.map((row) => (
        <View key={row.id} style={{ gap: 6 }}>
          {row.groups.map((group) => (
            <View key={group.id} style={{ gap: 4 }}>
              <Text className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {group.label ? `${row.label} | ${group.label}` : row.label}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {group.keys.map((key, i) => (
                  <KeyView
                    key={`${key.id}-${i}`}
                    def={key}
                    mods={pad.mods}
                    settings={settings}
                    onPress={pad.press}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      ))}
      <Text className="pb-2 text-center text-[10px] text-muted-foreground">
        Change keys in Settings, Keyboard
      </Text>
    </ScrollView>
  );
}
