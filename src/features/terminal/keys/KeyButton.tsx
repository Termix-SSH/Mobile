import React, { useState, useRef, useEffect, useCallback } from "react";
import { TouchableOpacity, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { KeySize } from "./KeyPrefsContext";
import {
  DEFAULT_KEY_REPEAT_INTERVAL,
  DEFAULT_KEY_REPEAT_INITIAL_DELAY,
  useKeyRepeat,
} from "@/constants/keyboard-repeat-config";
import { useUiColors } from "@/contexts/ThemeContext";

interface KeyButtonProps {
  label: string;
  onPress: () => void;
  style?: any;
  textStyle?: any;
  isActive?: boolean;
  /** A locked sticky modifier, drawn with a bar under the label. */
  isLocked?: boolean;
  isModifier?: boolean;
  keySize?: KeySize;
  hapticFeedback?: boolean;
  onLongPress?: () => void;
  keyRepeatEnabled?: boolean;
  keyRepeatInterval?: number;
  keyRepeatInitialDelay?: number;
}

export default function KeyButton({
  label,
  onPress,
  style = {},
  textStyle = {},
  isActive = false,
  isLocked = false,
  isModifier = false,
  keySize = "medium",
  hapticFeedback = false,
  onLongPress,
  keyRepeatEnabled = false,
  keyRepeatInterval = DEFAULT_KEY_REPEAT_INTERVAL,
  keyRepeatInitialDelay = DEFAULT_KEY_REPEAT_INITIAL_DELAY,
}: KeyButtonProps) {
  const ui = useUiColors();
  const [isPressed, setIsPressed] = useState(false);
  const onPressRef = useRef(onPress);
  const hapticFeedbackRef = useRef(hapticFeedback);

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    hapticFeedbackRef.current = hapticFeedback;
  }, [hapticFeedback]);

  const handlePress = useCallback(() => {
    if (hapticFeedbackRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPressRef.current();
  }, []);

  const handlePressIn = useCallback(() => {
    setIsPressed(true);
    if (keyRepeatEnabled) handlePress();
  }, [handlePress, keyRepeatEnabled]);

  useKeyRepeat(
    isPressed,
    keyRepeatEnabled,
    handlePress,
    keyRepeatInterval,
    keyRepeatInitialDelay,
  );

  const handlePressOut = useCallback(() => {
    setIsPressed(false);
  }, []);

  const handleLongPress = () => {
    if (hapticFeedbackRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (onLongPress) {
      onLongPress();
    }
  };

  const getSizeClass = () => {
    switch (keySize) {
      case "small":
        return "px-1.5 py-1.5 min-w-[32px] min-h-[32px]";
      case "large":
        return "px-2.5 py-2.5 min-w-[42px] min-h-[42px]";
      case "medium":
      default:
        return "px-2 py-2 min-w-[36px] min-h-[36px]";
    }
  };

  const getTextSizeClass = () => {
    switch (keySize) {
      case "small":
        return "text-[11px]";
      case "large":
        return "text-sm";
      case "medium":
      default:
        return "text-xs";
    }
  };

  // Flat keys; an on modifier gets a brand tint instead of a border.
  const bgColor = isActive
    ? isModifier
      ? `${ui.brand}2e`
      : ui.active
    : ui.muted;

  return (
    <TouchableOpacity
      className={`items-center justify-center ${getSizeClass()}`}
      style={{
        ...style,
        backgroundColor: bgColor,
        borderRadius: 0,
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={keyRepeatEnabled ? undefined : handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      activeOpacity={0.7}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={isModifier ? { selected: isActive } : undefined}
      accessibilityHint={isLocked ? "Locked" : undefined}
    >
      <Text
        className={`text-center font-medium ${getTextSizeClass()}`}
        style={[{ color: isActive ? ui.brand : ui.text }, textStyle]}
      >
        {label}
      </Text>
      {isLocked ? (
        <View
          style={{
            position: "absolute",
            bottom: 2,
            left: 6,
            right: 6,
            height: 2,
            backgroundColor: ui.brand,
          }}
        />
      ) : null}
    </TouchableOpacity>
  );
}
