import React, { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlignLeft,
  ArrowLeft,
  Bell,
  History,
  Link,
  Palette,
  Rows3,
  TextCursor,
  Type,
} from "lucide-react-native";
import { useTerminalCustomization } from "@/contexts/TerminalCustomizationContext";
import { MOBILE_DEFAULT_TERMINAL_CONFIG } from "@/constants/terminal-config";
import { TERMINAL_THEMES } from "@/constants/terminal-themes";
import {
  BELL_STYLES,
  CURSOR_STYLES,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  TERMINAL_FONTS,
  resolveTerminalColors,
  terminalFont,
} from "@/features/terminal/settings";
import { toast } from "@/utils/toast";
import {
  Button,
  FakeSwitch,
  Input,
  Sheet,
  SheetBody,
  SettingRow,
  Text,
} from "@/ui";
import { useTheme, useThemeColor } from "@/contexts/ThemeContext";
import type { TerminalConfig } from "@/types";
import { TerminalPreview } from "./terminal/TerminalPreview";
import { CustomThemeSheet } from "./terminal/CustomThemeSheet";

const FONT_SIZES = [12, 14, 16, 18, 20, 24];
const LINE_HEIGHTS = [
  { label: "Compact", value: 1 },
  { label: "Default", value: 1.1 },
  { label: "Relaxed", value: 1.25 },
  { label: "Spacious", value: 1.5 },
];
const LETTER_SPACINGS = [
  { label: "None", value: 0 },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
];
const SCROLLBACKS = [1000, 5000, 10000, 50000];

// Termix Default first, then the named themes. Custom has its own tile.
const THEME_IDS = Object.keys(TERMINAL_THEMES).filter((id) => id !== "custom");

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  const color = useThemeColor();
  return (
    <View className="border border-border bg-card">
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-3">
        <Icon size={14} color={color("muted-foreground")} />
        <Text
          weight="bold"
          className="text-[11px] uppercase tracking-[2px] text-foreground"
        >
          {title}
        </Text>
      </View>
      <View className="px-3 pb-3 pt-2">{children}</View>
    </View>
  );
}

function Choices<T extends string | number>({
  options,
  value,
  onPick,
}: {
  options: readonly { label: string; value: T }[];
  value: T | undefined;
  onPick: (value: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onPick(option.value)}
            className={`border px-3 py-2 ${active ? "border-accent-brand bg-accent-brand/10" : "border-border bg-background"}`}
          >
            <Text
              weight="medium"
              className={`text-row ${active ? "text-accent-text" : "text-foreground"}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TerminalCustomization() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const { resolvedTheme } = useTheme();
  const { config, updateConfig, updateFontSize, resetToDefault } =
    useTerminalCustomization();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [customFontSize, setCustomFontSize] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(false);

  const current = { ...MOBILE_DEFAULT_TERMINAL_CONFIG, ...config };
  const theme = current.theme ?? "termix";
  const fontFamily = terminalFont(current.fontFamily);
  const colors = resolveTerminalColors(
    theme,
    resolvedTheme,
    current.customThemeColors,
  );

  const save = (updates: Partial<TerminalConfig>) => {
    updateConfig(updates).catch(() => toast.error("Could not save"));
  };

  const handleCustomFontSize = async () => {
    const size = Number(customFontSize);
    if (
      !Number.isFinite(size) ||
      size < MIN_FONT_SIZE ||
      size > MAX_FONT_SIZE
    ) {
      toast.error(`Pick a size from ${MIN_FONT_SIZE} to ${MAX_FONT_SIZE}`);
      return;
    }
    await updateFontSize(size);
    setShowCustomInput(false);
    setCustomFontSize("");
  };

  const handleReset = async () => {
    await resetToDefault();
    toast.success("Terminal settings reset");
    setShowResetConfirm(false);
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 pb-3 pt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={8}
          className="shrink-0"
        >
          <ArrowLeft size={18} color={color("foreground")} />
        </Pressable>
        <Text weight="bold" className="flex-1 text-xl text-foreground">
          Terminal
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      >
        <TerminalPreview
          colors={colors}
          fontFamily={fontFamily}
          fontSize={current.fontSize ?? 14}
        />
        <Text className="-mt-2 text-meta text-muted-foreground">
          A host can set its own theme and cursor in Termix, which wins over
          these.
        </Text>

        <Section icon={Palette} title="Theme">
          <View className="flex-row flex-wrap gap-2">
            {[...THEME_IDS, "custom"].map((id) => {
              const c = resolveTerminalColors(
                id,
                resolvedTheme,
                current.customThemeColors,
              );
              const active = id === theme;
              const name =
                id === "termix"
                  ? "Follows app theme"
                  : (TERMINAL_THEMES[id]?.name ?? id);
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  accessibilityState={{ selected: active }}
                  onPress={() =>
                    id === "custom"
                      ? setShowThemeEditor(true)
                      : save({ theme: id })
                  }
                  style={{ width: "31%" }}
                  className={`border ${active ? "border-accent-brand" : "border-border"}`}
                >
                  <View style={{ backgroundColor: c.background, padding: 6 }}>
                    <View className="flex-row gap-0.5">
                      {[c.red, c.green, c.yellow, c.blue, c.magenta].map(
                        (dot, i) => (
                          <View
                            key={i}
                            style={{
                              width: 8,
                              height: 8,
                              backgroundColor: dot,
                            }}
                          />
                        ),
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: c.foreground,
                        fontSize: 11,
                        marginTop: 6,
                      }}
                    >
                      {id === "custom" ? "Custom" : name}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section icon={Type} title="Font">
          {TERMINAL_FONTS.map((option, i) => {
            const active = fontFamily === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => save({ fontFamily: option.value })}
                className={`flex-row items-center justify-between py-2.5 ${i < TERMINAL_FONTS.length - 1 ? "border-b border-border" : ""}`}
              >
                <View className="min-w-0 flex-1">
                  <Text
                    weight="medium"
                    className={`text-sm ${active ? "text-accent-text" : "text-foreground"}`}
                  >
                    {option.label}
                  </Text>
                  <Text
                    className="mt-0.5 text-[12px] text-muted-foreground"
                    style={{
                      fontFamily:
                        option.value === "monospace" ? undefined : option.value,
                    }}
                  >
                    {"ls -la -> != >= 0O 1lI"}
                  </Text>
                </View>
                {active ? (
                  <View className="shrink-0 border border-accent-brand/40 bg-accent-brand/10 px-1.5 py-0.5">
                    <Text
                      weight="bold"
                      className="text-[8px] uppercase tracking-wider text-accent-text"
                    >
                      Active
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </Section>

        <Section icon={AlignLeft} title="Size and spacing">
          <Text className="mb-2 text-meta text-muted-foreground">
            Pinch the terminal to change the size too. Large text in your phone
            settings makes it bigger.
          </Text>
          <Choices
            options={[
              ...FONT_SIZES.map((s) => ({ label: String(s), value: s })),
              {
                label: FONT_SIZES.includes(current.fontSize ?? 14)
                  ? "Custom"
                  : `Custom ${current.fontSize}`,
                value: -1,
              },
            ]}
            value={
              FONT_SIZES.includes(current.fontSize ?? 14)
                ? current.fontSize
                : -1
            }
            onPick={(value) =>
              value === -1 ? setShowCustomInput(true) : updateFontSize(value)
            }
          />
          <Text className="mb-2 mt-4 text-meta text-muted-foreground">
            Line height
          </Text>
          <Choices
            options={LINE_HEIGHTS}
            value={current.lineHeight}
            onPick={(value) => save({ lineHeight: value })}
          />
          <Text className="mb-2 mt-4 text-meta text-muted-foreground">
            Letter spacing
          </Text>
          <Choices
            options={LETTER_SPACINGS}
            value={current.letterSpacing}
            onPick={(value) => save({ letterSpacing: value })}
          />
        </Section>

        <Section icon={TextCursor} title="Cursor">
          <Choices
            options={CURSOR_STYLES}
            value={current.cursorStyle}
            onPick={(value) => save({ cursorStyle: value })}
          />
          <View className="mt-2">
            <SettingRow label="Blink" last>
              <FakeSwitch
                checked={current.cursorBlink ?? true}
                onChange={(v) => save({ cursorBlink: v })}
                accessibilityLabel="Blink"
              />
            </SettingRow>
          </View>
        </Section>

        <Section icon={Bell} title="Bell">
          <Choices
            options={BELL_STYLES}
            value={current.bellStyle}
            onPick={(value) => save({ bellStyle: value })}
          />
          <View className="mt-2">
            <SettingRow
              label="Vibrate"
              description="On the bell and when you long press to select"
              last
            >
              <FakeSwitch
                checked={current.haptics ?? true}
                onChange={(v) => save({ haptics: v })}
                accessibilityLabel="Vibrate"
              />
            </SettingRow>
          </View>
        </Section>

        <Section icon={Rows3} title="Scrollback">
          <Text className="mb-2 text-meta text-muted-foreground">
            Lines kept above the screen. Applies to new terminals.
          </Text>
          <Choices
            options={SCROLLBACKS.map((n) => ({
              label: n.toLocaleString(),
              value: n,
            }))}
            value={current.scrollback}
            onPick={(value) => save({ scrollback: value })}
          />
        </Section>

        <Section icon={Link} title="Links and keys">
          <SettingRow
            label="Ask before opening links"
            last={Platform.OS !== "ios"}
          >
            <FakeSwitch
              checked={current.linkClickBehavior !== "direct"}
              onChange={(v) =>
                save({ linkClickBehavior: v ? "confirm" : "direct" })
              }
              accessibilityLabel="Ask before opening links"
            />
          </SettingRow>
          {Platform.OS === "ios" ? (
            <SettingRow
              label="Option sends Alt"
              description="On a hardware keyboard. Off types symbols like on a Mac."
              last
            >
              <FakeSwitch
                checked={current.optionAsMeta ?? false}
                onChange={(v) => save({ optionAsMeta: v })}
                accessibilityLabel="Option sends Alt"
              />
            </SettingRow>
          ) : null}
        </Section>

        <Section icon={History} title="History">
          <SettingRow
            label="Suggest commands"
            description="Shows past commands that start with what you type"
            last
          >
            <FakeSwitch
              checked={current.commandSuggestions ?? false}
              onChange={(v) => save({ commandSuggestions: v })}
              accessibilityLabel="Suggest commands"
            />
          </SettingRow>
        </Section>

        <Button variant="destructive" onPress={() => setShowResetConfirm(true)}>
          Reset to default
        </Button>
      </ScrollView>

      <CustomThemeSheet
        visible={showThemeEditor}
        initial={current.customThemeColors ?? colors}
        fontFamily={fontFamily}
        onClose={() => setShowThemeEditor(false)}
        onSave={(customThemeColors) => {
          save({ theme: "custom", customThemeColors });
          setShowThemeEditor(false);
        }}
      />

      <Sheet
        scroll
        visible={showCustomInput}
        onClose={() => {
          setShowCustomInput(false);
          setCustomFontSize("");
        }}
        title="Font size"
        description={`A size from ${MIN_FONT_SIZE} to ${MAX_FONT_SIZE}.`}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setShowCustomInput(false);
                setCustomFontSize("");
              }}
            >
              Cancel
            </Button>
            <Button variant="default" size="sm" onPress={handleCustomFontSize}>
              Apply
            </Button>
          </>
        }
      >
        <SheetBody>
          <Input
            value={customFontSize}
            onChangeText={setCustomFontSize}
            placeholder="15"
            keyboardType="number-pad"
            autoFocus
          />
        </SheetBody>
      </Sheet>

      <Sheet
        scroll
        visible={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="Reset terminal settings?"
        description="Theme, font, size, cursor, bell and the rest go back to the defaults."
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setShowResetConfirm(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onPress={handleReset}>
              Reset
            </Button>
          </>
        }
      />
    </View>
  );
}
