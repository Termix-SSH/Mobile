import React, { createContext, useContext, useState, useEffect } from "react";
import { Keyboard, Platform, Dimensions } from "react-native";
import { currentWindowSize } from "@/utils/window-class";

interface KeyboardContextType {
  keyboardHeight: number;
  isKeyboardVisible: boolean;
  showKeyboard: () => void;
}

const KeyboardContext = createContext<KeyboardContextType>({
  keyboardHeight: 0,
  isKeyboardVisible: false,
  showKeyboard: () => {},
});

/** How much of the screen the keyboard covers, from the bottom. */
export function visibleKeyboardHeight(frame: {
  screenY: number;
  width: number;
  height: number;
}): number {
  const screen = Dimensions.get("screen");
  if (Platform.OS === "android") {
    return Math.max(0, screen.height - frame.screenY);
  }
  // Dimensions keeps the folded size after a foldable opens, so the measured
  // root size comes first.
  const measured = currentWindowSize();
  const sides = [measured.width, measured.height, screen.width, screen.height];
  // A docked keyboard ends at the bottom of the screen.
  const bottom = frame.screenY + frame.height;
  if (frame.height > 0 && sides.some((side) => Math.abs(bottom - side) <= 1)) {
    return frame.height;
  }
  const long = Math.max(measured.width, measured.height);
  const short = Math.min(measured.width, measured.height);
  // The keyboard spans the screen's width, which tells the orientation even while
  // the size is still the old one during a turn.
  const screenHeight = frame.width >= long - 1 ? short : long;
  return Math.max(0, Math.min(frame.height, screenHeight - frame.screenY));
}

export const KeyboardProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const showKeyboard = () => {
    if (Platform.OS === "android") {
      setIsKeyboardVisible(true);
    }
  };

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const keyboardShowListener = Keyboard.addListener(showEvent, (e) => {
      const newHeight = visibleKeyboardHeight(e.endCoordinates);
      if (newHeight > 0) {
        setKeyboardHeight(newHeight);
        setIsKeyboardVisible(true);
      } else if (Platform.OS === "ios") {
        // A frame change off screen, like turning the phone with the keyboard closed.
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    });

    const keyboardHideListener = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      keyboardShowListener?.remove();
      keyboardHideListener?.remove();
    };
  }, []);

  return (
    <KeyboardContext.Provider
      value={{ keyboardHeight, isKeyboardVisible, showKeyboard }}
    >
      {children}
    </KeyboardContext.Provider>
  );
};

export const useKeyboard = () => {
  const context = useContext(KeyboardContext);
  if (!context) {
    throw new Error("useKeyboard must be used within a KeyboardProvider");
  }
  return context;
};
