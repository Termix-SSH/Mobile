import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TerminalHandle } from "./Terminal";
import CustomKeyboard from "./CustomKeyboard";
import SnippetsBar from "./SnippetsBar";
import CommandHistoryBar from "./CommandHistoryBar";

type ToolbarMode = "keyboard" | "snippets" | "history";

interface BottomToolbarProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  isVisible: boolean;
  keyboardHeight: number;
  isKeyboardIntentionallyHidden?: boolean;
  currentHostId?: number;
}

export default function BottomToolbar({
  terminalRef,
  isVisible,
  keyboardHeight,
  isKeyboardIntentionallyHidden = false,
  currentHostId,
}: BottomToolbarProps) {
  const [mode, setMode] = useState<ToolbarMode>("keyboard");
  const insets = useSafeAreaInsets();

  if (!isVisible) return null;

  // Constrain keyboard height to safe values
  const safeKeyboardHeight = Math.max(200, Math.min(keyboardHeight, 500));

  const tabs: { id: ToolbarMode; label: string; icon: string }[] = [
    { id: "keyboard", label: "Keyboard", icon: "⌨️" },
    { id: "snippets", label: "Snippets", icon: "📋" },
    { id: "history", label: "History", icon: "🕒" },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, mode === tab.id && styles.tabActive]}
            onPress={() => setMode(tab.id)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text
              style={[styles.tabLabel, mode === tab.id && styles.tabLabelActive]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content Area */}
      <View style={[styles.content, { height: safeKeyboardHeight }]}>
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
          <CommandHistoryBar
            terminalRef={terminalRef}
            isVisible={true}
            height={safeKeyboardHeight}
            currentHostId={currentHostId}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0e0e10",
    borderTopWidth: 1.5,
    borderTopColor: "#303032",
    maxHeight: 550,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#18181b",
    borderBottomWidth: 1,
    borderBottomColor: "#303032",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
    backgroundColor: "#18181b",
  },
  tabActive: {
    backgroundColor: "#0e0e10",
    borderBottomWidth: 2,
    borderBottomColor: "#9333ea",
  },
  tabIcon: {
    fontSize: 16,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#888",
  },
  tabLabelActive: {
    color: "#9333ea",
  },
  content: {
    overflow: "hidden",
  },
});
