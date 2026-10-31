import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Input, Sheet, SheetBody, Text } from "@/ui";
import type { TerminalThemeColors } from "@/constants/terminal-themes";
import { TerminalPreview } from "./TerminalPreview";

const FIELDS: { key: keyof TerminalThemeColors; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "foreground", label: "Text" },
  { key: "cursor", label: "Cursor" },
  { key: "cursorAccent", label: "Text under cursor" },
  { key: "selectionBackground", label: "Selection" },
  { key: "black", label: "Black" },
  { key: "red", label: "Red" },
  { key: "green", label: "Green" },
  { key: "yellow", label: "Yellow" },
  { key: "blue", label: "Blue" },
  { key: "magenta", label: "Magenta" },
  { key: "cyan", label: "Cyan" },
  { key: "white", label: "White" },
  { key: "brightBlack", label: "Bright black" },
  { key: "brightRed", label: "Bright red" },
  { key: "brightGreen", label: "Bright green" },
  { key: "brightYellow", label: "Bright yellow" },
  { key: "brightBlue", label: "Bright blue" },
  { key: "brightMagenta", label: "Bright magenta" },
  { key: "brightCyan", label: "Bright cyan" },
  { key: "brightWhite", label: "Bright white" },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Colors that are all valid hex, or the first field that is not. */
export function checkColors(
  colors: Partial<Record<keyof TerminalThemeColors, string>>,
): { ok: true; colors: TerminalThemeColors } | { ok: false; label: string } {
  for (const field of FIELDS) {
    const value = colors[field.key]?.trim() ?? "";
    const optional =
      field.key === "cursor" ||
      field.key === "cursorAccent" ||
      field.key === "selectionBackground";
    if (!value && optional) continue;
    if (!HEX.test(value)) return { ok: false, label: field.label };
  }
  return { ok: true, colors: colors as TerminalThemeColors };
}

/** Edits the colors of the Custom terminal theme. */
export function CustomThemeSheet({
  visible,
  initial,
  fontFamily,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: TerminalThemeColors;
  fontFamily?: string;
  onClose: () => void;
  onSave: (colors: TerminalThemeColors) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft(
      Object.fromEntries(FIELDS.map((f) => [f.key, initial[f.key] ?? ""])),
    );
    setError(null);
  }, [visible, initial]);

  const checked = checkColors(draft);
  const preview = checked.ok ? checked.colors : initial;

  return (
    <Sheet
      scroll
      visible={visible}
      onClose={onClose}
      title="Custom theme"
      description="Colors as hex, like #1e1e2e."
      footer={
        <>
          <Button variant="ghost" size="sm" onPress={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onPress={() => {
              if (!checked.ok) {
                setError(`${checked.label} is not a hex color`);
                return;
              }
              onSave(checked.colors);
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <SheetBody>
        <TerminalPreview colors={preview} fontFamily={fontFamily} />
        {error ? (
          <Text className="mt-2 text-meta text-destructive-text">{error}</Text>
        ) : null}
        <View className="mt-3 gap-2">
          {FIELDS.map((field) => (
            <View key={field.key} className="flex-row items-center gap-3">
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderWidth: 1,
                  borderColor: "#888",
                  backgroundColor: HEX.test(draft[field.key] ?? "")
                    ? draft[field.key]
                    : "transparent",
                }}
              />
              <Text className="w-32 text-row text-foreground">
                {field.label}
              </Text>
              <View className="flex-1">
                <Input
                  value={draft[field.key] ?? ""}
                  onChangeText={(v) =>
                    setDraft((d) => ({ ...d, [field.key]: v }))
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="#000000"
                />
              </View>
            </View>
          ))}
        </View>
      </SheetBody>
    </Sheet>
  );
}
