import React, { useState, useEffect } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { TerminalHandle } from "../Terminal";
import KeyboardKey from "./KeyboardKey";
import { useKeyboardCustomization } from "@/app/contexts/KeyboardCustomizationContext";
import { KeyConfig } from "@/types/keyboard";
import { useOrientation } from "@/app/utils/orientation";
import { BACKGROUNDS, BORDER_COLORS } from "@/app/constants/designTokens";

interface KeyboardBarProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  isVisible: boolean;
  onModifierChange?: (modifiers: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
  }) => void;
  isKeyboardIntentionallyHidden?: boolean;
}

export default function KeyboardBar({
  terminalRef,
  isVisible,
  onModifierChange,
  isKeyboardIntentionallyHidden = false,
}: KeyboardBarProps) {
  const { config } = useKeyboardCustomization();
  const { isLandscape } = useOrientation();
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [altPressed, setAltPressed] = useState(false);
  const [shiftPressed, setShiftPressed] = useState(false);

  const sendKey = (key: string) => {
    terminalRef.current?.sendInput(key);
  };

  const sendSpecialKey = (keyConfig: KeyConfig) => {
    const { value, id } = keyConfig;

    switch (id) {
      case "escape":
        sendKey("\x1b");
        break;
      case "tab":
      case "complete":
      case "comp":
        sendKey(shiftPressed ? "\x1b[Z" : "\t");
        break;
      case "shiftTab":
        sendKey("\x1b[Z");
        break;
      case "arrowUp":
      case "history":
      case "hist":
        sendKey("\x1b[A");
        break;
      case "arrowDown":
        sendKey("\x1b[B");
        break;
      case "arrowRight":
        sendKey("\x1b[C");
        break;
      case "arrowLeft":
        sendKey("\x1b[D");
        break;
      case "paste":
        handlePaste();
        break;
      default:
        sendKey(value);
    }
  };

  const handlePaste = async () => {
    try {
      const clipboardContent = await Clipboard.getStringAsync();
      if (clipboardContent) {
        sendKey(clipboardContent);
      }
    } catch {}
  };

  const toggleModifier = (modifier: "ctrl" | "alt" | "shift") => {
    switch (modifier) {
      case "ctrl":
        setCtrlPressed(!ctrlPressed);
        break;
      case "alt":
        setAltPressed(!altPressed);
        break;
      case "shift":
        setShiftPressed(!shiftPressed);
        break;
    }
  };

  useEffect(() => {
    if (onModifierChange) {
      onModifierChange({
        ctrl: ctrlPressed,
        alt: altPressed,
        shift: shiftPressed,
      });
    }
  }, [ctrlPressed, altPressed, shiftPressed, onModifierChange]);

  if (!isVisible) return null;

  const renderKey = (keyConfig: KeyConfig, index: number) => {
    const isModifier =
      keyConfig.isModifier ||
      keyConfig.id === "ctrl" ||
      keyConfig.id === "alt" ||
      keyConfig.id === "shift";
    const isCtrl = keyConfig.id === "ctrl";
    const isAlt = keyConfig.id === "alt";
    const isShift = keyConfig.id === "shift";

    return (
      <KeyboardKey
        key={`${keyConfig.id}-${index}`}
        label={keyConfig.label}
        onPress={() => {
          if (isModifier) {
            if (isCtrl) toggleModifier("ctrl");
            else if (isAlt) toggleModifier("alt");
            else if (isShift) toggleModifier("shift");
          } else {
            sendSpecialKey(keyConfig);
          }
        }}
        isModifier={isModifier}
        isActive={
          isCtrl
            ? ctrlPressed
            : isAlt
              ? altPressed
              : isShift
                ? shiftPressed
                : false
        }
        keySize={config.settings.keySize}
        hapticFeedback={config.settings.hapticFeedback}
      />
    );
  };

  const { pinnedKeys, keys } = config.topBar;
  const hasPinnedKeys = pinnedKeys.length > 0;

  return (
    <View
      style={{
        backgroundColor: BACKGROUNDS.DARKEST,
        paddingBottom: isKeyboardIntentionallyHidden ? 16 : 0,
        marginTop: 2,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: BORDER_COLORS.PRIMARY,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 8,
          paddingVertical: isLandscape ? 6 : 8,
          alignItems: "center",
          gap: isLandscape ? 4 : 6,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {hasPinnedKeys && (
          <>
            {pinnedKeys.map((key, index) => renderKey(key, index))}
            <View
              className="mx-2 h-[30px] w-px"
              style={{ backgroundColor: BORDER_COLORS.PRIMARY }}
            />
          </>
        )}

        {keys.map((key, index) => renderKey(key, index))}
      </ScrollView>
    </View>
  );
}
