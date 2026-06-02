import React, { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Type, AlignLeft, Rows3 } from "lucide-react-native";
import { useTerminalCustomization } from "@/app/contexts/TerminalCustomizationContext";
import { toast } from "@/app/utils/toast";
import { TERMINAL_FONTS } from "@/constants/terminal-themes";
import { Text, Button, Input, Dialog } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

const FONT_SIZE_OPTIONS = [
  { label: "Extra Small", value: 12 },
  { label: "Small", value: 14 },
  { label: "Medium", value: 16 },
  { label: "Large", value: 18 },
  { label: "Extra Large", value: 20 },
  { label: "Huge", value: 24 },
];

const LETTER_SPACING_OPTIONS = [
  { label: "Default", value: 0 },
  { label: "Relaxed", value: 0.5 },
  { label: "Wide", value: 1 },
  { label: "Wider", value: 1.5 },
  { label: "Widest", value: 2 },
];

const LINE_HEIGHT_OPTIONS = [
  { label: "Compact", value: 1.0 },
  { label: "Default", value: 1.2 },
  { label: "Relaxed", value: 1.4 },
  { label: "Spacious", value: 1.6 },
];

export default function TerminalCustomization() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const {
    config,
    updateFontFamily,
    updateFontSize,
    updateLetterSpacing,
    updateLineHeight,
    resetToDefault,
  } = useTerminalCustomization();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [customFontSize, setCustomFontSize] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const isCustomFontSize = !FONT_SIZE_OPTIONS.some(
    (option) => option.value === config.fontSize,
  );

  const handleFontSizeChange = async (fontSize: number) => {
    try {
      await updateFontSize(fontSize);
      toast.success(`Font size updated to ${fontSize}px`);
    } catch {
      toast.error("Failed to update font size");
    }
  };

  const handleFontFamilyChange = async (fontFamily: string, label: string) => {
    try {
      await updateFontFamily(fontFamily);
      toast.success(`Font updated to ${label}`);
    } catch {
      toast.error("Failed to update font");
    }
  };

  const handleLetterSpacingChange = async (value: number) => {
    try {
      await updateLetterSpacing(value);
    } catch {
      toast.error("Failed to update letter spacing");
    }
  };

  const handleLineHeightChange = async (value: number) => {
    try {
      await updateLineHeight(value);
    } catch {
      toast.error("Failed to update line height");
    }
  };

  const handleReset = async () => {
    try {
      await resetToDefault();
      toast.success("Terminal settings reset to default");
      setShowResetConfirm(false);
    } catch {
      toast.error("Failed to reset settings");
    }
  };

  const handleCustomFontSize = async () => {
    const fontSize = parseInt(customFontSize);
    if (isNaN(fontSize) || fontSize <= 0) {
      toast.error("Please enter a valid font size");
      return;
    }
    try {
      await updateFontSize(fontSize);
      toast.success(`Font size updated to ${fontSize}px`);
      setShowCustomInput(false);
      setCustomFontSize("");
    } catch {
      toast.error("Failed to update font size");
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-border px-4 pb-3 pt-3">
        <Pressable
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
        {/* Font Family */}
        <View className="border border-border bg-card">
          <View className="flex-row items-center gap-2 border-b border-border px-3 py-3">
            <Type size={14} color={color("muted-foreground")} />
            <Text
              weight="bold"
              className="text-[11px] uppercase tracking-[2px] text-foreground"
            >
              Font Family
            </Text>
          </View>
          <View className="gap-1.5 px-3 pb-3 pt-2">
            <Text className="mb-1 text-[11px] text-muted-foreground">
              Nerd Font support depends on the selected font being available to
              the WebView.
            </Text>
            {TERMINAL_FONTS.map((option, i) => {
              const isActive = config.fontFamily === option.value;
              const isLast = i === TERMINAL_FONTS.length - 1;
              return (
                <Pressable
                  key={option.value}
                  onPress={() =>
                    handleFontFamilyChange(option.value, option.label)
                  }
                  className={`flex-row items-center justify-between py-2.5 ${!isLast ? "border-b border-border" : ""}`}
                >
                  <View className="min-w-0 flex-1">
                    <Text
                      weight="medium"
                      className={`text-sm ${isActive ? "text-accent-brand" : "text-foreground"}`}
                    >
                      {option.label}
                    </Text>
                    <Text
                      className="mt-0.5 text-[10px] text-muted-foreground"
                      style={{ fontFamily: option.fallback }}
                    >
                      Aa Bb Cc 123
                    </Text>
                  </View>
                  {isActive ? (
                    <View className="shrink-0 border border-accent-brand/40 bg-accent-brand/10 px-1.5 py-0.5">
                      <Text
                        weight="bold"
                        className="text-[8px] uppercase tracking-wider text-accent-brand"
                      >
                        Active
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Font Size */}
        <View className="border border-border bg-card">
          <View className="flex-row items-center gap-2 border-b border-border px-3 py-3">
            <AlignLeft size={14} color={color("muted-foreground")} />
            <Text
              weight="bold"
              className="text-[11px] uppercase tracking-[2px] text-foreground"
            >
              Font Size
            </Text>
          </View>
          <View className="gap-1.5 px-3 pb-3 pt-2">
            <Text className="mb-1 text-[11px] text-muted-foreground">
              Base size for terminal text. Overrides the font size configured on
              the host in Termix Web UI.
            </Text>
            {FONT_SIZE_OPTIONS.map((option, i) => {
              const isActive = config.fontSize === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleFontSizeChange(option.value)}
                  className={`flex-row items-center justify-between py-2.5 ${i < FONT_SIZE_OPTIONS.length - 1 || !isCustomFontSize ? "border-b border-border" : ""}`}
                >
                  <View>
                    <Text
                      weight="medium"
                      className={`text-sm ${isActive ? "text-accent-brand" : "text-foreground"}`}
                    >
                      {option.label}
                    </Text>
                    <Text className="mt-0.5 text-[10px] text-muted-foreground">
                      {option.value}px
                    </Text>
                  </View>
                  {isActive ? (
                    <View className="border border-accent-brand/40 bg-accent-brand/10 px-1.5 py-0.5">
                      <Text
                        weight="bold"
                        className="text-[8px] uppercase tracking-wider text-accent-brand"
                      >
                        Active
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}

            {/* Custom size row */}
            <Pressable
              onPress={() => setShowCustomInput(true)}
              className="flex-row items-center justify-between py-2.5"
            >
              <View>
                <Text
                  weight="medium"
                  className={`text-sm ${isCustomFontSize ? "text-accent-brand" : "text-foreground"}`}
                >
                  Custom
                </Text>
                <Text className="mt-0.5 text-[10px] text-muted-foreground">
                  {isCustomFontSize ? `${config.fontSize}px` : "Enter any size"}
                </Text>
              </View>
              {isCustomFontSize ? (
                <View className="border border-accent-brand/40 bg-accent-brand/10 px-1.5 py-0.5">
                  <Text
                    weight="bold"
                    className="text-[8px] uppercase tracking-wider text-accent-brand"
                  >
                    Active
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {/* Spacing */}
        <View className="border border-border bg-card">
          <View className="flex-row items-center gap-2 border-b border-border px-3 py-3">
            <Rows3 size={14} color={color("muted-foreground")} />
            <Text
              weight="bold"
              className="text-[11px] uppercase tracking-[2px] text-foreground"
            >
              Spacing
            </Text>
          </View>
          <View className="px-3 pb-3 pt-2">
            <Text className="mb-3 text-[11px] text-muted-foreground">
              Letter Spacing
            </Text>
            <View className="gap-1.5">
              {LETTER_SPACING_OPTIONS.map((option, i) => {
                const isActive =
                  (config.letterSpacing ?? 0) === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleLetterSpacingChange(option.value)}
                    className={`flex-row items-center justify-between py-2.5 ${i < LETTER_SPACING_OPTIONS.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <Text
                      weight="medium"
                      className={`text-sm ${isActive ? "text-accent-brand" : "text-foreground"}`}
                    >
                      {option.label}
                    </Text>
                    {isActive ? (
                      <View className="border border-accent-brand/40 bg-accent-brand/10 px-1.5 py-0.5">
                        <Text
                          weight="bold"
                          className="text-[8px] uppercase tracking-wider text-accent-brand"
                        >
                          Active
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Text className="mb-3 mt-4 text-[11px] text-muted-foreground">
              Line Height
            </Text>
            <View className="gap-1.5">
              {LINE_HEIGHT_OPTIONS.map((option, i) => {
                const isActive =
                  (config.lineHeight ?? 1.2) === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleLineHeightChange(option.value)}
                    className={`flex-row items-center justify-between py-2.5 ${i < LINE_HEIGHT_OPTIONS.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <Text
                      weight="medium"
                      className={`text-sm ${isActive ? "text-accent-brand" : "text-foreground"}`}
                    >
                      {option.label}
                    </Text>
                    {isActive ? (
                      <View className="border border-accent-brand/40 bg-accent-brand/10 px-1.5 py-0.5">
                        <Text
                          weight="bold"
                          className="text-[8px] uppercase tracking-wider text-accent-brand"
                        >
                          Active
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Reset */}
        <Button variant="destructive" onPress={() => setShowResetConfirm(true)}>
          Reset to Default
        </Button>
      </ScrollView>

      {/* Custom font size dialog */}
      <Dialog
        visible={showCustomInput}
        onClose={() => {
          setShowCustomInput(false);
          setCustomFontSize("");
        }}
        title="Custom Font Size"
        description="Enter your preferred font size for the terminal."
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
            <Button variant="accent" size="sm" onPress={handleCustomFontSize}>
              Apply
            </Button>
          </>
        }
      >
        <Input
          value={customFontSize}
          onChangeText={setCustomFontSize}
          placeholder="e.g. 15"
          keyboardType="number-pad"
          autoFocus
        />
      </Dialog>

      {/* Reset confirm dialog */}
      <Dialog
        visible={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="Confirm Reset"
        description="This will reset all terminal customizations to default settings."
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
