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
  const { config, updateFontSize, resetToDefault } = useTerminalCustomization();
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
    } catch (error) {
      showToast.error("Failed to update font size");
    }
  };

  const handleReset = async () => {
    try {
      await resetToDefault();
      showToast.success("Terminal settings reset to default");
      setShowResetConfirm(false);
    } catch (error) {
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
    } catch (error) {
      showToast.error("Failed to update font size");
    }
  };

  return (
    <View className="flex-1 bg-[#18181b]">
      <View
        className="bg-[#1a1a1a] border-b border-[#303032] px-4"
        style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
      >
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-green-500 text-base font-semibold">
              ← Back
            </Text>
          </TouchableOpacity>
          <Text className="text-white text-lg font-semibold">
            Terminal Customization
          </Text>
          <View style={{ width: 60 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4 py-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Text className="text-white text-lg font-semibold mb-2">
          Terminal Settings
        </Text>
        <Text className="text-gray-400 text-sm mb-4">
          Customize terminal appearance and behavior
        </Text>

        <View className="mb-6">
          <Text className="text-white text-base font-semibold mb-3">
            Font Size
          </Text>
          <Text className="text-gray-400 text-sm mb-3">
            Base font size for terminal text. The actual size will be adjusted
            based on your screen width. This number will override the font size
            you configured on a host in the Termix Web UI.
          </Text>
          <View className="gap-2">
            {FONT_SIZE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => handleFontSizeChange(option.value)}
                className={`p-4 rounded-lg border ${
                  config.fontSize === option.value
                    ? "bg-green-900/20 border-green-500"
                    : "bg-[#1a1a1a] border-[#303032]"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text
                      className={`text-base font-semibold ${
                        config.fontSize === option.value
                          ? "text-green-400"
                          : "text-white"
                      }`}
                    >
                      {option.label}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-0.5">
                      {option.value}px base size
                    </Text>
                  </View>
                  {config.fontSize === option.value && (
                    <View className="bg-green-500 rounded-full px-2 py-1">
                      <Text className="text-white text-xs font-semibold">
                        ACTIVE
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={() => setShowCustomInput(true)}
              className={`p-4 rounded-lg border ${
                isCustomFontSize
                  ? "bg-green-900/20 border-green-500"
                  : "bg-[#1a1a1a] border-[#303032]"
              }`}
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <Text
                    className={`text-base font-semibold ${
                      isCustomFontSize ? "text-green-400" : "text-white"
                    }`}
                  >
                    Custom
                  </Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                    {isCustomFontSize
                      ? `${config.fontSize}px base size`
                      : "Enter any custom size"}
                  </Text>
                </View>
                {isCustomFontSize && (
                  <View className="bg-green-500 rounded-full px-2 py-1">
                    <Text className="text-white text-xs font-semibold">
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
          className="bg-red-900/20 border border-red-700 rounded-lg p-3"
        >
          <Text className="text-red-400 text-center font-semibold">
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
            className="flex-1 bg-black/50 justify-center items-center"
            onPress={() => {
              setShowCustomInput(false);
              setCustomFontSize("");
            }}
          >
            <Pressable className="bg-[#1a1a1a] rounded-lg p-6 mx-8 border border-[#303032] w-80">
              <Text className="text-white text-lg font-semibold mb-2">
                Custom Font Size
              </Text>
              <Text className="text-gray-400 text-sm mb-4">
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
              <View className="flex-row gap-3 mt-4">
                <TouchableOpacity
                  onPress={() => {
                    setShowCustomInput(false);
                    setCustomFontSize("");
                  }}
                  className="flex-1 bg-[#27272a] border border-[#3f3f46] rounded-lg p-3"
                >
                  <Text className="text-white text-center font-semibold">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCustomFontSize}
                  className="flex-1 bg-green-600 rounded-lg p-3"
                >
                  <Text className="text-white text-center font-semibold">
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
          className="flex-1 bg-black/50 justify-center items-center"
          onPress={() => setShowResetConfirm(false)}
        >
          <Pressable className="bg-[#1a1a1a] rounded-lg p-6 mx-8 border border-[#303032]">
            <Text className="text-white text-lg font-semibold mb-2">
              Confirm Reset
            </Text>
            <Text className="text-gray-400 text-sm mb-6">
              This will reset all terminal customizations to default settings.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowResetConfirm(false)}
                className="flex-1 bg-[#27272a] border border-[#3f3f46] rounded-lg p-3"
              >
                <Text className="text-white text-center font-semibold">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReset}
                className="flex-1 bg-red-600 rounded-lg p-3"
              >
                <Text className="text-white text-center font-semibold">
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
