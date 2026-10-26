import React from "react";
import { View, TouchableOpacity, Keyboard, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react-native";
import {
  SessionType,
  TerminalSession,
} from "@/contexts/TerminalSessionsContext";
import { useRouter } from "expo-router";
import { useWindowInfo } from "@/utils/window-class";
import { getTabBarHeight, getButtonSize } from "@/utils/responsive";
import { useUiColors } from "@/contexts/ThemeContext";
import { features } from "@/core/features";
import { TabStrip } from "./TabStrip";

interface TabBarProps {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onTabPress: (sessionId: string) => void;
  onTabClose: (sessionId: string) => void;
  onAddSession?: () => void;
  onToggleKeyboard?: () => void;
  isCustomKeyboardVisible: boolean;
  /** Shows or hides the keyboard on the active terminal. */
  onKeyboard: (action: "focus" | "blur") => void;
  onHideKeyboard?: () => void;
  onShowKeyboard?: () => void;
  keyboardIntentionallyHiddenRef: React.MutableRefObject<boolean>;
  activeSessionType?: SessionType;
  onShowConnections?: () => void;
  hasBackgroundSessions?: boolean;
  /** Tapping the active tab opens its menu. */
  onTabMenu?: (sessionId: string) => void;
  onTabMove?: (sessionId: string, toIndex: number) => void;
}

export default function TabBar({
  sessions,
  activeSessionId,
  onTabPress,
  onTabClose,
  onToggleKeyboard,
  isCustomKeyboardVisible,
  onKeyboard,
  onHideKeyboard,
  onShowKeyboard,
  keyboardIntentionallyHiddenRef,
  activeSessionType,
  onShowConnections,
  onTabMenu,
  onTabMove,
}: TabBarProps) {
  const ui = useUiColors();
  const router = useRouter();
  const { isLandscape, isShort } = useWindowInfo();
  const insets = useSafeAreaInsets();

  const tabBarHeight = getTabBarHeight(isLandscape, isShort);
  const buttonSize = getButtonSize(isLandscape, 44, isShort);

  const needsBottomPadding = !features.sessionHas(
    activeSessionType,
    "terminal-input",
  );

  const handleToggleSystemKeyboard = () => {
    if (keyboardIntentionallyHiddenRef.current) {
      onShowKeyboard?.();
      setTimeout(() => {
        onKeyboard("focus");
      }, 50);
    } else {
      onHideKeyboard?.();
      // Keyboard.dismiss() only reaches RN text inputs; the terminal keeps
      // the keyboard up until it is blurred.
      onKeyboard("blur");
      Keyboard.dismiss();
    }
  };

  if (sessions.length === 0) {
    return null;
  }

  const hasInput = features.sessionHas(activeSessionType, "terminal-input");
  const iconSize = isLandscape ? 16 : 18;

  return (
    <View
      style={{
        backgroundColor: ui.background,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: ui.border,
        height: tabBarHeight + (needsBottomPadding ? insets.bottom : 0),
        paddingBottom: needsBottomPadding ? insets.bottom : 0,
      }}
      focusable={false}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: tabBarHeight,
          paddingHorizontal: 6,
          gap: isLandscape ? 4 : 6,
        }}
      >
        <BarButton
          label="Connections"
          size={buttonSize}
          onPress={() => onShowConnections?.()}
        >
          <Layers size={iconSize} color={ui.text} />
        </BarButton>
        <BarButton
          label="Back to hosts"
          size={buttonSize}
          onPress={() => router.navigate("/hosts" as any)}
        >
          <ArrowLeft size={iconSize} color={ui.text} />
        </BarButton>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <TabStrip
            sessions={sessions}
            activeSessionId={activeSessionId}
            compact={isLandscape}
            height={buttonSize}
            onTabPress={onTabPress}
            onTabClose={onTabClose}
            onTabMenu={onTabMenu}
            onTabMove={onTabMove}
          />
        </View>

        {hasInput && !isCustomKeyboardVisible ? (
          <BarButton
            label={
              keyboardIntentionallyHiddenRef.current
                ? "Show keyboard"
                : "Hide keyboard"
            }
            size={buttonSize}
            onPress={handleToggleSystemKeyboard}
          >
            {keyboardIntentionallyHiddenRef.current ? (
              <ChevronUp size={iconSize} color={ui.text} />
            ) : (
              <ChevronDown size={iconSize} color={ui.text} />
            )}
          </BarButton>
        ) : null}

        {hasInput ? (
          <BarButton
            label={
              isCustomKeyboardVisible ? "Hide keys panel" : "Show keys panel"
            }
            size={buttonSize}
            active={isCustomKeyboardVisible}
            onPress={() => onToggleKeyboard?.()}
          >
            {isCustomKeyboardVisible ? (
              <Minus size={iconSize} color={ui.brand} />
            ) : (
              <Plus size={iconSize} color={ui.text} />
            )}
          </BarButton>
        ) : null}
      </View>
    </View>
  );
}

/** A square bar button, flat like the app's muted Button. */
function BarButton({
  label,
  size,
  active = false,
  onPress,
  children,
}: {
  label: string;
  size: number;
  active?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const ui = useUiColors();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      focusable={false}
      className="items-center justify-center"
      activeOpacity={0.6}
      style={{
        width: size,
        height: size,
        backgroundColor: active ? `${ui.brand}26` : ui.muted,
      }}
    >
      {children}
    </TouchableOpacity>
  );
}
