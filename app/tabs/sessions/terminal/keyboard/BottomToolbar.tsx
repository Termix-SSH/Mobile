import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TerminalHandle } from "../Terminal";
import CustomKeyboard from "./CustomKeyboard";
import SnippetsBar from "./SnippetsBar";
import {
  BACKGROUNDS,
  BORDER_COLORS,
  ACCENT,
  TEXT_COLORS,
} from "@/app/constants/designTokens";

type ToolbarMode = "keyboard" | "snippets" | "history";

interface BottomToolbarProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  isVisible: boolean;
  keyboardHeight: number;
  isKeyboardIntentionallyHidden?: boolean;
  initialTab?: ToolbarMode;
}

export default function BottomToolbar({
  terminalRef,
  isVisible,
  keyboardHeight,
  isKeyboardIntentionallyHidden = false,
  initialTab = "keyboard",
}: BottomToolbarProps) {
  const [mode, setMode] = useState<ToolbarMode>(initialTab);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setMode(initialTab);
  }, [initialTab]);

  if (!isVisible) return null;

  const safeKeyboardHeight = Math.max(200, Math.min(keyboardHeight, 500));

  const tabs: { id: ToolbarMode; label: string }[] = [
    { id: "keyboard", label: "KEYBOARD" },
    { id: "snippets", label: "SNIPPETS" },
    { id: "history", label: "HISTORY" },
  ];

  const TAB_BAR_HEIGHT = 36;

  return (
    <View style={{ backgroundColor: BACKGROUNDS.DARKEST, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER_COLORS.PRIMARY }} pointerEvents="box-none">
      <View
        style={{
          flexDirection: "row",
          height: TAB_BAR_HEIGHT,
          backgroundColor: BACKGROUNDS.DARKEST,
        }}
      >
        {tabs.map((tab, index) => {
          const isActive = mode === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 6,
                paddingHorizontal: 4,
                backgroundColor: isActive ? BACKGROUNDS.CARD : BACKGROUNDS.DARKEST,
                borderRightWidth: index !== tabs.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderRightColor: BORDER_COLORS.PRIMARY,
              }}
              onPress={() => setMode(tab.id)}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 0.8,
                  textAlign: "center",
                  color: isActive ? ACCENT : TEXT_COLORS.TERTIARY,
                }}
              >
                {tab.label}
              </Text>
              {isActive && (
                <View
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: StyleSheet.hairlineWidth * 2,
                    backgroundColor: ACCENT,
                  }}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View
        style={{
          height: safeKeyboardHeight,
          paddingBottom: insets.bottom,
          overflow: "hidden",
          backgroundColor: BACKGROUNDS.DARKEST,
        }}
      >
        {mode === "keyboard" && (
          <CustomKeyboard
            terminalRef={terminalRef}
            isVisible={true}
            keyboardHeight={safeKeyboardHeight}
            isKeyboardIntentionallyHidden={isKeyboardIntentionallyHidden}
          />
        )}

        {mode === "snippets" && (
          <SnippetsBar
            terminalRef={terminalRef}
            isVisible={true}
            height={safeKeyboardHeight}
          />
        )}

        {mode === "history" && (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "500",
                color: TEXT_COLORS.SECONDARY,
              }}
            >
              No history yet
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: TEXT_COLORS.TERTIARY,
                marginTop: 4,
                textAlign: "center",
                paddingHorizontal: 24,
              }}
            >
              Commands will appear here as you run them
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
