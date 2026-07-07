import React, { useState, useRef, useEffect, useCallback } from "react";
import { TouchableOpacity, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { KeySize } from "@/types/keyboard";
import {
  BACKGROUNDS,
  BORDER_COLORS,
  ACCENT,
} from "@/app/constants/designTokens";
import {
  DEFAULT_KEY_REPEAT_INTERVAL,
  DEFAULT_KEY_REPEAT_INITIAL_DELAY,
  useKeyRepeat,
} from "@/constants/keyboard-repeat-config";

interface KeyboardKeyProps {
  label: string;
  onPress: () => void;
  style?: any;
  textStyle?: any;
  isActive?: boolean;
  isModifier?: boolean;
  keySize?: KeySize;
  hapticFeedback?: boolean;
  onLongPress?: () => void;
  keyRepeatEnabled?: boolean;
  keyRepeatInterval?: number;
  keyRepeatInitialDelay?: number;
}

export default function KeyboardKey({
  label,
  onPress,
  style = {},
  textStyle = {},
  isActive = false,
  isModifier = false,
  keySize = "medium",
  hapticFeedback = false,
  onLongPress,
  keyRepeatEnabled = false,
  keyRepeatInterval = DEFAULT_KEY_REPEAT_INTERVAL,
  keyRepeatInitialDelay = DEFAULT_KEY_REPEAT_INITIAL_DELAY,
}: KeyboardKeyProps) {
  const [isPressed, setIsPressed] = useState(false);
  const onPressRef = useRef(onPress);
  const hapticFeedbackRef = useRef(hapticFeedback);

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    hapticFeedbackRef.current = hapticFeedback;
  }, [hapticFeedback]);

  const handlePressIn = useCallback(() => {
    setIsPressed(true);
  }, []);

  const handlePress = useCallback(() => {
    if (hapticFeedbackRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPressRef.current();
  }, []);

  useKeyRepeat(
    isPressed, keyRepeatEnabled, handlePress, keyRepeatInterval, keyRepeatInitialDelay,
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

  const bgColor = isActive
    ? isModifier
      ? `${ACCENT}26`
      : BACKGROUNDS.ACTIVE
    : BACKGROUNDS.BUTTON;
  const borderColor = isActive ? ACCENT : BORDER_COLORS.BUTTON;

  return (
    <TouchableOpacity
      className={`items-center justify-center ${getSizeClass()}`}
      style={{
        ...style,
        backgroundColor: bgColor,
        borderWidth: 1,
        borderColor,
        borderRadius: 0,
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      activeOpacity={0.7}
      delayLongPress={500}
    >
      <Text
        className={`text-center font-medium ${getTextSizeClass()}`}
        style={[{ color: isActive ? ACCENT : "#e4e4e4" }, textStyle]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
