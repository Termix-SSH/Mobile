import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Input, Sheet, SheetBody, Text } from "@/ui";
import type { TerminalThemeColors } from "@/constants/terminal-themes";
import { TerminalPreview } from "./TerminalPreview";
import { t } from "@/i18n";

const FIELDS: { key: keyof TerminalThemeColors; label: string }[] = [
  {
    key: "background",
    label: t("settings.terminal.customThemeSheet.background"),
  },
  { key: "foreground", label: t("settings.terminal.customThemeSheet.text") },
  { key: "cursor", label: t("settings.terminal.customThemeSheet.cursor") },
  {
    key: "cursorAccent",
    label: t("settings.terminal.customThemeSheet.textUnderCursor"),
  },
  {
    key: "selectionBackground",
    label: t("settings.terminal.customThemeSheet.selection"),
  },
  { key: "black", label: t("settings.terminal.customThemeSheet.black") },
  { key: "red", label: t("settings.terminal.customThemeSheet.red") },
  { key: "green", label: t("settings.terminal.customThemeSheet.green") },
  { key: "yellow", label: t("settings.terminal.customThemeSheet.yellow") },
  { key: "blue", label: t("settings.terminal.customThemeSheet.blue") },
  { key: "magenta", label: t("settings.terminal.customThemeSheet.magenta") },
  { key: "cyan", label: t("settings.terminal.customThemeSheet.cyan") },
  { key: "white", label: t("settings.terminal.customThemeSheet.white") },
  {
    key: "brightBlack",
    label: t("settings.terminal.customThemeSheet.brightBlack"),
  },
  {
    key: "brightRed",
    label: t("settings.terminal.customThemeSheet.brightRed"),
  },
  {
    key: "brightGreen",
    label: t("settings.terminal.customThemeSheet.brightGreen"),
  },
  {
    key: "brightYellow",
    label: t("settings.terminal.customThemeSheet.brightYellow"),
  },
  {
    key: "brightBlue",
    label: t("settings.terminal.customThemeSheet.brightBlue"),
  },
  {
    key: "brightMagenta",
    label: t("settings.terminal.customThemeSheet.brightMagenta"),
  },
  {
    key: "brightCyan",
    label: t("settings.terminal.customThemeSheet.brightCyan"),
  },
  {
    key: "brightWhite",
    label: t("settings.terminal.customThemeSheet.brightWhite"),
  },
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
      title={t("settings.terminal.customThemeSheet.customTheme")}
      description={t(
        "settings.terminal.customThemeSheet.colorsAsHexLike1e1e2e",
      )}
      footer={
        <>
          <Button variant="ghost" size="sm" onPress={onClose}>
            {t("settings.terminal.customThemeSheet.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onPress={() => {
              if (!checked.ok) {
                setError(
                  t("settings.terminal.customThemeSheet.isNotAHexColor", {
                    label: checked.label,
                  }),
                );
                return;
              }
              onSave(checked.colors);
            }}
          >
            {t("settings.terminal.customThemeSheet.save")}
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
