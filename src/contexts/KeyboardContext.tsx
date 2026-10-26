import React, { createContext, useContext, useState, useEffect } from "react";
import { Keyboard, Platform, Dimensions } from "react-native";
import { trace } from "@/core/log/trace";

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
  const long = Math.max(screen.width, screen.height);
  const short = Math.min(screen.width, screen.height);
  if (Platform.OS === "android") {
    return Math.max(0, screen.height - frame.screenY);
  }
  // The keyboard spans the screen's width, which tells the orientation even while
  // Dimensions still has the old one during a turn.
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
      trace("kb", `event ${showEvent}`, {
        screenY: Math.round(e.endCoordinates.screenY),
        width: Math.round(e.endCoordinates.width),
        height: Math.round(e.endCoordinates.height),
        visible: Math.round(newHeight),
      });
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
      trace("kb", `event ${hideEvent}`);
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
