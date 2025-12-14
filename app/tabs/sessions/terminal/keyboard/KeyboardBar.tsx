import React, { useState, useEffect } from "react";
import { View, ScrollView, Text, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { TerminalHandle } from "../Terminal";
import KeyboardKey from "./KeyboardKey";
import { useKeyboardCustomization } from "@/app/contexts/KeyboardCustomizationContext";
import { KeyConfig } from "@/types/keyboard";
import { useKeyboard } from "@/app/contexts/KeyboardContext";
import { useOrientation } from "@/app/utils/orientation";
import {
  BORDERS,
  BORDER_COLORS,
  BACKGROUNDS,
} from "@/app/constants/designTokens";

interface KeyboardBarProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  isVisible: boolean;
  onModifierChange?: (modifiers: { ctrl: boolean; alt: boolean }) => void;
  isKeyboardIntentionallyHidden?: boolean;
}

export default function KeyboardBar({
  terminalRef,
  isVisible,
  onModifierChange,
  isKeyboardIntentionallyHidden = false,
}: KeyboardBarProps) {
  const { config } = useKeyboardCustomization();
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();
  const { isLandscape } = useOrientation();
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [altPressed, setAltPressed] = useState(false);

  if (!isVisible) return null;

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
        sendKey("\t");
        break;
      case "arrowUp":
      case "history":
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
      const clipboardContent = await Clipboard.getString();
      if (clipboardContent) {
        sendKey(clipboardContent);
      }
    } catch (error) {}
  };

  const toggleModifier = (modifier: "ctrl" | "alt") => {
    switch (modifier) {
      case "ctrl":
        setCtrlPressed(!ctrlPressed);
        break;
      case "alt":
        setAltPressed(!altPressed);
        break;
    }
  };

  useEffect(() => {
    if (onModifierChange) {
      onModifierChange({ ctrl: ctrlPressed, alt: altPressed });
    }
  }, [ctrlPressed, altPressed]);

  const renderKey = (keyConfig: KeyConfig, index: number) => {
    const isModifier =
      keyConfig.isModifier || keyConfig.id === "ctrl" || keyConfig.id === "alt";
    const isCtrl = keyConfig.id === "ctrl";
    const isAlt = keyConfig.id === "alt";

    return (
      <KeyboardKey
        key={`${keyConfig.id}-${index}`}
        label={keyConfig.label}
        onPress={() => {
          if (isModifier) {
            if (isCtrl) toggleModifier("ctrl");
            else if (isAlt) toggleModifier("alt");
          } else {
            sendSpecialKey(keyConfig);
          }
        }}
        isModifier={isModifier}
        isActive={isCtrl ? ctrlPressed : isAlt ? altPressed : false}
        keySize={config.settings.keySize}
        hapticFeedback={config.settings.hapticFeedback}
      />
    );
  };

  const { pinnedKeys, keys } = config.topBar;
  const hasPinnedKeys = pinnedKeys.length > 0;

  return (
    <View style={{ position: "relative", marginTop: isLandscape ? -2 : -4 }}>
      <View
        style={{
          backgroundColor: BACKGROUNDS.DARKER,
          paddingBottom: isKeyboardIntentionallyHidden ? 16 : 0,
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
                className="w-px h-[30px] mx-2"
                style={{ backgroundColor: BORDER_COLORS.SEPARATOR }}
              />
            </>
          )}

          {keys.map((key, index) => renderKey(key, index))}
        </ScrollView>
      </View>
      <View
        style={{
          position: "absolute",
          bottom: -52,
          left: 0,
          right: 0,
          backgroundColor: BACKGROUNDS.DARKER,
          height: 55,
        }}
      />
    </View>
  );
}
