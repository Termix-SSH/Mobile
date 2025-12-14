import React from "react";
import { View, ScrollView, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import { TerminalHandle } from "../Terminal";
import KeyboardKey from "./KeyboardKey";
import { useKeyboardCustomization } from "@/app/contexts/KeyboardCustomizationContext";
import { KeyConfig } from "@/types/keyboard";
import { BORDER_COLORS, SPACING } from "@/app/constants/designTokens";

interface CustomKeyboardProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  isVisible: boolean;
  keyboardHeight: number;
  isKeyboardIntentionallyHidden?: boolean;
}

export default function CustomKeyboard({
  terminalRef,
  isVisible,
  keyboardHeight,
  isKeyboardIntentionallyHidden = false,
}: CustomKeyboardProps) {
  const { config } = useKeyboardCustomization();

  if (!isVisible) return null;

  const sendKey = (key: string) => {
    terminalRef.current?.sendInput(key);
  };

  const handleKeyPress = (keyConfig: KeyConfig) => {
    const { value, id } = keyConfig;

    switch (id) {
      case "paste":
        handlePaste();
        break;
      case "enter":
        sendKey("\r");
        break;
      case "space":
        sendKey(" ");
        break;
      case "backspace":
        sendKey("\x7f");
        break;
      case "escape":
        sendKey("\x1b");
        break;
      case "tab":
      case "complete":
        sendKey("\t");
        break;
      case "arrowUp":
      case "history":
        sendKey("\x1b[A");
        break;
      case "arrowDown":
        sendKey("\x1b[B");
        break;
      case "arrowLeft":
        sendKey("\x1b[D");
        break;
      case "arrowRight":
        sendKey("\x1b[C");
        break;
      case "home":
        sendKey("\x1b[H");
        break;
      case "end":
        sendKey("\x1b[F");
        break;
      case "pageUp":
        sendKey("\x1b[5~");
        break;
      case "pageDown":
        sendKey("\x1b[6~");
        break;
      case "delete":
        sendKey("\x1b[3~");
        break;
      case "insert":
        sendKey("\x1b[2~");
        break;
      case "clear":
        sendKey("\x0c");
        break;
      default:
        sendKey(value);
    }
  };

  const handlePaste = async () => {
    try {
      const clipboardContent = await Clipboard.getString();
      if (clipboardContent) {
        sendKey(clipboardContent);
      }
    } catch (error) {}
  };

  const { rows } = config.fullKeyboard;
  const { compactMode, keySize } = config.settings;
  const visibleRows = rows.filter((row) => row.visible);

  const getKeyGap = () => {
    if (compactMode) return 2;
    if (keySize === "small") return 3;
    if (keySize === "large") return 5;
    return 4;
  };

  const getKeyStyle = (keyConfig: KeyConfig) => {
    const baseStyle: any = {};

    if (keyConfig.width === "narrow" || keyConfig.category === "number") {
      baseStyle.flex = 1;
      baseStyle.minWidth = 0;
      baseStyle.paddingHorizontal = 4;
    } else if (keyConfig.width === "wide") {
      baseStyle.minWidth = 80;
    } else if (keyConfig.width === "full") {
      baseStyle.flex = 1;
    }

    return baseStyle;
  };

  const safeKeyboardHeight = Math.max(200, Math.min(keyboardHeight, 500));

  return (
    <View className="h-full bg-dark-bg-darkest" pointerEvents="box-none">
      <ScrollView
        className="h-full"
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        pointerEvents="auto"
      >
        {visibleRows.map((row, rowIndex) => (
          <View key={row.id}>
            {row.label && (
              <View className="mb-1 mt-1">
                <Text className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                  {row.label}
                </Text>
              </View>
            )}

            <View
              className={`flex-row items-center mb-0 ${
                row.category === "number" ? "flex-nowrap" : "flex-wrap"
              } ${compactMode ? "-mb-0.5" : ""}`}
              style={{ gap: getKeyGap() }}
            >
              {row.keys.map((key, keyIndex) => (
                <KeyboardKey
                  key={`${row.id}-${key.id}-${keyIndex}`}
                  label={key.label}
                  onPress={() => handleKeyPress(key)}
                  style={getKeyStyle(key)}
                  keySize={config.settings.keySize}
                  hapticFeedback={config.settings.hapticFeedback}
                />
              ))}
            </View>

            {rowIndex < visibleRows.length - 1 && (
              <View
                className="h-px mx-0"
                style={{
                  backgroundColor: BORDER_COLORS.SEPARATOR,
                  marginVertical: compactMode ? 4 : 8,
                }}
              />
            )}
          </View>
        ))}

        {config.settings.showHints && !isKeyboardIntentionallyHidden && (
          <View className="px-2 pt-2 pb-1 items-center">
            <Text className="text-[10px] text-gray-600 italic">
              Customize in Settings
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
