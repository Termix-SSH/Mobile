import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  ArrowLeft,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native";
import { TerminalSession } from "@/app/contexts/TerminalSessionsContext";
import { useRouter } from "expo-router";
import { useKeyboard } from "@/app/contexts/KeyboardContext";
import { useOrientation } from "@/app/utils/orientation";
import { getTabBarHeight, getButtonSize } from "@/app/utils/responsive";
import {
  BORDERS,
  BORDER_COLORS,
  BACKGROUNDS,
  RADIUS,
} from "@/app/constants/designTokens";

interface TabBarProps {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onTabPress: (sessionId: string) => void;
  onTabClose: (sessionId: string) => void;
  onAddSession?: () => void;
  onToggleKeyboard?: () => void;
  isCustomKeyboardVisible: boolean;
  hiddenInputRef: React.RefObject<TextInput | null>;
  onHideKeyboard?: () => void;
  onShowKeyboard?: () => void;
  keyboardIntentionallyHiddenRef: React.MutableRefObject<boolean>;
  activeSessionType?: "terminal" | "stats" | "filemanager";
}

export default function TabBar({
  sessions,
  activeSessionId,
  onTabPress,
  onTabClose,
  onAddSession,
  onToggleKeyboard,
  isCustomKeyboardVisible,
  hiddenInputRef,
  onHideKeyboard,
  onShowKeyboard,
  keyboardIntentionallyHiddenRef,
  activeSessionType,
}: TabBarProps) {
  const router = useRouter();
  const { isKeyboardVisible } = useKeyboard();
  const { isLandscape } = useOrientation();
  const insets = useSafeAreaInsets();

  const tabBarHeight = getTabBarHeight(isLandscape);
  const buttonSize = getButtonSize(isLandscape);

  const needsBottomPadding = activeSessionType !== "terminal";

  const handleToggleSystemKeyboard = () => {
    if (keyboardIntentionallyHiddenRef.current) {
      onShowKeyboard?.();
      setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 50);
    } else {
      onHideKeyboard?.();
      Keyboard.dismiss();
    }
  };

  if (sessions.length === 0) {
    return null;
  }

  return (
    <View style={{ position: "relative" }}>
      <View
        style={{
          backgroundColor: BACKGROUNDS.DARKER,
          borderTopWidth: BORDERS.MAJOR,
          borderTopColor: BORDER_COLORS.PRIMARY,
          borderBottomWidth:
            activeSessionType === "terminal" ? BORDERS.STANDARD : 0,
          borderBottomColor: BORDER_COLORS.PRIMARY,
          height: tabBarHeight + (needsBottomPadding ? insets.bottom : 0),
          paddingBottom: needsBottomPadding ? insets.bottom : 0,
          justifyContent:
            activeSessionType === "terminal" ? "center" : "flex-start",
        }}
        focusable={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: tabBarHeight,
            paddingHorizontal: 8,
          }}
        >
          <TouchableOpacity
            onPress={() => router.navigate("/hosts" as any)}
            focusable={false}
            className="items-center justify-center"
            activeOpacity={0.7}
            style={{
              width: buttonSize,
              height: buttonSize,
              borderWidth: BORDERS.STANDARD,
              borderColor: BORDER_COLORS.BUTTON,
              backgroundColor: BACKGROUNDS.BUTTON,
              borderRadius: RADIUS.BUTTON,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
              marginRight: isLandscape ? 6 : 8,
            }}
          >
            <ArrowLeft size={isLandscape ? 18 : 20} color="#ffffff" />
          </TouchableOpacity>

          <View style={{ flex: 1, justifyContent: "center" }}>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="always"
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              focusable={false}
              contentContainerStyle={{
                paddingHorizontal: 0,
                gap: 6,
                alignItems: "center",
              }}
              className="flex-row"
              scrollEnabled={true}
              directionalLockEnabled={true}
              nestedScrollEnabled={false}
              alwaysBounceVertical={false}
              alwaysBounceHorizontal={false}
              bounces={false}
              bouncesZoom={false}
              scrollEventThrottle={16}
              removeClippedSubviews={false}
              overScrollMode="never"
              disableIntervalMomentum={true}
              pagingEnabled={false}
            >
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;

                return (
                  <TouchableOpacity
                    key={session.id}
                    onPress={() => onTabPress(session.id)}
                    focusable={false}
                    className="flex-row items-center"
                    style={{
                      borderWidth: BORDERS.STANDARD,
                      borderColor: isActive
                        ? BORDER_COLORS.ACTIVE
                        : BORDER_COLORS.BUTTON,
                      backgroundColor: BACKGROUNDS.CARD,
                      borderRadius: RADIUS.BUTTON,
                      shadowColor: isActive
                        ? BORDER_COLORS.ACTIVE
                        : "transparent",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isActive ? 0.2 : 0,
                      shadowRadius: 4,
                      elevation: isActive ? 3 : 0,
                      minWidth: isLandscape ? 100 : 120,
                      height: buttonSize,
                    }}
                  >
                    <View className="flex-1 px-3 py-2">
                      <Text
                        className={`text-sm font-medium ${
                          isActive ? "text-green-400" : "text-gray-400"
                        }`}
                      >
                        {session.title}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        onTabClose(session.id);
                      }}
                      focusable={false}
                      className="items-center justify-center"
                      activeOpacity={0.7}
                      style={{
                        width: isLandscape ? 32 : 36,
                        height: buttonSize,
                        borderLeftWidth: BORDERS.STANDARD,
                        borderLeftColor: isActive
                          ? BORDER_COLORS.ACTIVE
                          : BORDER_COLORS.BUTTON,
                      }}
                    >
                      <X
                        size={isLandscape ? 14 : 16}
                        color={isActive ? "#ffffff" : "#9CA3AF"}
                        strokeWidth={2}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {activeSessionType === "terminal" && !isCustomKeyboardVisible && (
            <TouchableOpacity
              onPress={handleToggleSystemKeyboard}
              focusable={false}
              className="items-center justify-center"
              activeOpacity={0.7}
              style={{
                width: buttonSize,
                height: buttonSize,
                borderWidth: BORDERS.STANDARD,
                borderColor: BORDER_COLORS.BUTTON,
                backgroundColor: BACKGROUNDS.BUTTON,
                borderRadius: RADIUS.BUTTON,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
                marginLeft: isLandscape ? 6 : 8,
              }}
            >
              {keyboardIntentionallyHiddenRef.current ? (
                <ChevronUp size={isLandscape ? 18 : 20} color="#ffffff" />
              ) : (
                <ChevronDown size={isLandscape ? 18 : 20} color="#ffffff" />
              )}
            </TouchableOpacity>
          )}

          {activeSessionType === "terminal" && (
            <TouchableOpacity
              onPress={() => onToggleKeyboard?.()}
              focusable={false}
              className="items-center justify-center"
              activeOpacity={0.7}
              style={{
                width: buttonSize,
                height: buttonSize,
                borderWidth: BORDERS.STANDARD,
                borderColor: BORDER_COLORS.BUTTON,
                backgroundColor: BACKGROUNDS.BUTTON,
                borderRadius: RADIUS.BUTTON,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
                marginLeft: isLandscape ? 6 : 8,
              }}
            >
              {isCustomKeyboardVisible ? (
                <Minus size={isLandscape ? 18 : 20} color="#ffffff" />
              ) : (
                <Plus size={isLandscape ? 18 : 20} color="#ffffff" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
      {activeSessionType === "terminal" && isCustomKeyboardVisible && (
        <View
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            height: 2,
            backgroundColor: BORDER_COLORS.PRIMARY,
          }}
        />
      )}
    </View>
  );
}
