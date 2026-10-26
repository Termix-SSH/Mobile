import { View } from "react-native";
import { Sheet, Text } from "@/ui";
import {
  shortcutSections,
  shortcutSheet,
  useShortcutSheetOpen,
} from "@/core/shortcuts";

/** Every keyboard shortcut in one list. Opens with Cmd / or from Settings. */
export function ShortcutSheet() {
  const visible = useShortcutSheetOpen();
  return (
    <Sheet
      visible={visible}
      onClose={shortcutSheet.close}
      title="Keyboard shortcuts"
      scroll
    >
      {shortcutSections().map((section) => (
        <View key={section.title} className="pb-3">
          <Text
            weight="bold"
            className="px-4 pb-1 pt-3 text-[10px] uppercase tracking-[2px] text-muted-foreground"
          >
            {section.title}
          </Text>
          {section.rows.map((row) => (
            <View
              key={row.label}
              className="flex-row items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5"
            >
              <Text className="flex-1 text-sm text-foreground">
                {row.label}
              </Text>
              <Text className="text-meta text-muted-foreground">
                {row.keys}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </Sheet>
  );
}
