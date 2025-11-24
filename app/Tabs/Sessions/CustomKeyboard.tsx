import React from "react";
import { View, StyleSheet, ScrollView, Clipboard, Text } from "react-native";
import { TerminalHandle } from "./Terminal";
import KeyboardKey from "./KeyboardKey";
import { useKeyboardCustomization } from "@/app/contexts/KeyboardCustomizationContext";
import { KeyConfig } from "@/types/keyboard";

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
        sendKey("\x08");
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
    <View style={[styles.keyboard, { height: safeKeyboardHeight, maxHeight: 500 }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {visibleRows.map((row, rowIndex) => (
          <View key={row.id}>
            {row.label && (
              <View style={styles.rowLabelContainer}>
                <Text style={styles.rowLabel}>{row.label}</Text>
              </View>
            )}

            <View
              style={[
                row.category === "number" ? styles.numberRow : styles.keyRow,
                { gap: getKeyGap() },
                compactMode && styles.compactRow,
              ]}
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
                style={[
                  styles.separator,
                  compactMode && styles.compactSeparator,
                ]}
              />
            )}
          </View>
        ))}

        {config.settings.showHints && !isKeyboardIntentionallyHidden && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>Customize in Settings</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    backgroundColor: "#0e0e10",
    borderTopWidth: 1.5,
    borderTopColor: "#303032",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexGrow: 1,
  },
  rowLabelContainer: {
    marginBottom: 4,
    marginTop: 4,
  },
  rowLabel: {
    fontSize: 11,
    color: "#888",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 0,
    flexWrap: "wrap",
  },
  numberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 0,
    flexWrap: "nowrap",
  },
  compactRow: {
    marginBottom: -2,
  },
  separator: {
    height: 1,
    backgroundColor: "#404040",
    marginVertical: 8,
    marginHorizontal: 0,
  },
  compactSeparator: {
    marginVertical: 4,
  },
  hintContainer: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: "center",
  },
  hintText: {
    fontSize: 10,
    color: "#666",
    fontStyle: "italic",
  },
});
