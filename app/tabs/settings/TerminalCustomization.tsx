import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTerminalCustomization } from "@/app/contexts/TerminalCustomizationContext";
import { showToast } from "@/app/utils/toast";
import { TERMINAL_FONTS } from "@/constants/terminal-themes";

const FONT_SIZE_OPTIONS = [
  { label: "Extra Small", value: 12 },
  { label: "Small", value: 14 },
  { label: "Medium", value: 16 },
  { label: "Large", value: 18 },
  { label: "Extra Large", value: 20 },
  { label: "Huge", value: 24 },
];

export default function TerminalCustomization() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { config, updateFontFamily, updateFontSize, resetToDefault } =
    useTerminalCustomization();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [customFontSize, setCustomFontSize] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const isCustomFontSize = !FONT_SIZE_OPTIONS.some(
    (option) => option.value === config.fontSize,
  );

  const handleFontSizeChange = async (fontSize: number) => {
    try {
      await updateFontSize(fontSize);
      showToast.success(`Font size updated to ${fontSize}px`);
    } catch {
      showToast.error("Failed to update font size");
    }
  };

  const handleFontFamilyChange = async (fontFamily: string, label: string) => {
    try {
      await updateFontFamily(fontFamily);
      showToast.success(`Font updated to ${label}`);
    } catch {
      showToast.error("Failed to update font");
    }
  };

  const handleReset = async () => {
    try {
      await resetToDefault();
      showToast.success("Terminal settings reset to default");
      setShowResetConfirm(false);
    } catch {
      showToast.error("Failed to reset settings");
    }
  };

  const handleCustomFontSize = async () => {
    const fontSize = parseInt(customFontSize);
    if (isNaN(fontSize) || fontSize <= 0) {
      showToast.error("Please enter a valid font size");
      return;
    }
    try {
      await updateFontSize(fontSize);
      showToast.success(`Font size updated to ${fontSize}px`);
      setShowCustomInput(false);
      setCustomFontSize("");
    } catch {
      showToast.error("Failed to update font size");
    }
  };

  return (
    <View className="flex-1 bg-[#18181b]">
      <View
        className="border-b border-[#303032] bg-[#1a1a1a] px-4"
        style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
      >
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-base font-semibold text-accent-brand">
              ← Back
            </Text>
          </TouchableOpacity>
          <Text className="text-lg font-semibold text-foreground">
            Terminal Customization
          </Text>
          <View style={{ width: 60 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4 py-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Text className="mb-2 text-lg font-semibold text-foreground">
          Terminal Settings
        </Text>
        <Text className="mb-4 text-sm text-muted-foreground">
          Customize terminal appearance and behavior
        </Text>

        <View className="mb-6">
          <Text className="mb-3 text-base font-semibold text-foreground">Font</Text>
          <Text className="mb-3 text-sm text-muted-foreground">
            Select the terminal font family. Nerd Font support depends on the
            selected font being available to the WebView.
          </Text>
          <View className="gap-2">
            {TERMINAL_FONTS.map((option) => {
              const isActive = config.fontFamily === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() =>
                    handleFontFamilyChange(option.value, option.label)
                  }
                  className={`rounded-lg border p-4 ${
                    isActive
                      ? "border-green-500 bg-green-900/20"
                      : "border-[#303032] bg-[#1a1a1a]"
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text
                        className={`text-base font-semibold ${
                          isActive ? "text-accent-brand" : "text-foreground"
                        }`}
                      >
                        {option.label}
                      </Text>
                      <Text
                        className="mt-1 text-sm text-muted-foreground"
                        style={{ fontFamily: option.fallback }}
                      >
                        Aa Bb Cc 123 
                      </Text>
                    </View>
                    {isActive && (
                      <View className="rounded-full bg-accent-brand px-2 py-1">
                        <Text className="text-xs font-semibold text-foreground">
                          ACTIVE
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View className="mb-6">
          <Text className="mb-3 text-base font-semibold text-foreground">
            Font Size
          </Text>
          <Text className="mb-3 text-sm text-muted-foreground">
            Base font size for terminal text. The actual size will be adjusted
            based on your screen width. This number will override the font size
            you configured on a host in the Termix Web UI.
          </Text>
          <View className="gap-2">
            {FONT_SIZE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => handleFontSizeChange(option.value)}
                className={`rounded-lg border p-4 ${
                  config.fontSize === option.value
                    ? "border-green-500 bg-green-900/20"
                    : "border-[#303032] bg-[#1a1a1a]"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text
                      className={`text-base font-semibold ${
                        config.fontSize === option.value
                          ? "text-accent-brand"
                          : "text-foreground"
                      }`}
                    >
                      {option.label}
                    </Text>
                    <Text className="mt-0.5 text-xs text-muted-foreground">
                      {option.value}px base size
                    </Text>
                  </View>
                  {config.fontSize === option.value && (
                    <View className="rounded-full bg-accent-brand px-2 py-1">
                      <Text className="text-xs font-semibold text-foreground">
                        ACTIVE
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={() => setShowCustomInput(true)}
              className={`rounded-lg border p-4 ${
                isCustomFontSize
                  ? "border-green-500 bg-green-900/20"
                  : "border-[#303032] bg-[#1a1a1a]"
              }`}
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <Text
                    className={`text-base font-semibold ${
                      isCustomFontSize ? "text-accent-brand" : "text-foreground"
                    }`}
                  >
                    Custom
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    {isCustomFontSize
                      ? `${config.fontSize}px base size`
                      : "Enter any custom size"}
                  </Text>
                </View>
                {isCustomFontSize && (
                  <View className="rounded-full bg-accent-brand px-2 py-1">
                    <Text className="text-xs font-semibold text-foreground">
                      ACTIVE
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setShowResetConfirm(true)}
          className="rounded-lg border border-red-700 bg-red-900/20 p-3"
        >
          <Text className="text-center font-semibold text-red-400">
            Reset to Default
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showCustomInput}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCustomInput(false);
          setCustomFontSize("");
        }}
        supportedOrientations={["portrait", "landscape"]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <Pressable
            className="flex-1 items-center justify-center bg-black/50"
            onPress={() => {
              setShowCustomInput(false);
              setCustomFontSize("");
            }}
          >
            <Pressable className="mx-8 w-80 rounded-lg border border-[#303032] bg-[#1a1a1a] p-6">
              <Text className="mb-2 text-lg font-semibold text-foreground">
                Custom Font Size
              </Text>
              <Text className="mb-4 text-sm text-muted-foreground">
                Enter your preferred font size for the terminal.
              </Text>
              <TextInput
                value={customFontSize}
                onChangeText={setCustomFontSize}
                placeholder="e.g., 15"
                placeholderTextColor="#6b7280"
                keyboardType="number-pad"
                autoFocus
                style={{
                  backgroundColor: "#27272a",
                  borderWidth: 1,
                  borderColor: "#3f3f46",
                  borderRadius: 8,
                  padding: 12,
                  color: "#ffffff",
                  fontSize: 16,
                  textAlignVertical: "center",
                }}
              />
              <View className="mt-4 flex-row gap-3">
                <TouchableOpacity
                  onPress={() => {
                    setShowCustomInput(false);
                    setCustomFontSize("");
                  }}
                  className="flex-1 rounded-lg border border-[#3f3f46] bg-[#27272a] p-3"
                >
                  <Text className="text-center font-semibold text-foreground">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCustomFontSize}
                  className="flex-1 rounded-lg bg-accent-brand p-3"
                >
                  <Text className="text-center font-semibold text-foreground">
                    Apply
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showResetConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetConfirm(false)}
        supportedOrientations={["portrait", "landscape"]}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50"
          onPress={() => setShowResetConfirm(false)}
        >
          <Pressable className="mx-8 rounded-lg border border-[#303032] bg-[#1a1a1a] p-6">
            <Text className="mb-2 text-lg font-semibold text-foreground">
              Confirm Reset
            </Text>
            <Text className="mb-6 text-sm text-muted-foreground">
              This will reset all terminal customizations to default settings.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowResetConfirm(false)}
                className="flex-1 rounded-lg border border-[#3f3f46] bg-[#27272a] p-3"
              >
                <Text className="text-center font-semibold text-foreground">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReset}
                className="flex-1 rounded-lg bg-red-600 p-3"
              >
                <Text className="text-center font-semibold text-foreground">
                  Reset
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
