import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Keyboard,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  ArrowLeft,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  SquareTerminal,
  Activity,
  Folder,
  Network,
  Container,
  Monitor,
  Layers,
} from "lucide-react-native";
import {
  SessionType,
  TerminalSession,
} from "@/app/contexts/TerminalSessionsContext";
import { useRouter } from "expo-router";
import { useKeyboard } from "@/app/contexts/KeyboardContext";
import { useOrientation } from "@/app/utils/orientation";
import { getTabBarHeight, getButtonSize } from "@/app/utils/responsive";
import {
  BORDER_COLORS,
  BACKGROUNDS,
  RADIUS,
  ACCENT,
  TEXT_COLORS,
} from "@/app/constants/designTokens";

function getSessionIcon(type: SessionType) {
  switch (type) {
    case "terminal":
      return SquareTerminal;
    case "stats":
      return Activity;
    case "filemanager":
      return Folder;
    case "tunnel":
      return Network;
    case "docker":
      return Container;
    case "remoteDesktop":
      return Monitor;
  }
}

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
  activeSessionType?: SessionType;
  onShowConnections?: () => void;
  hasBackgroundSessions?: boolean;
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
  onShowConnections,
  hasBackgroundSessions,
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
          backgroundColor: BACKGROUNDS.DARKEST,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: BORDER_COLORS.PRIMARY,
          borderBottomWidth: 0,
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
            marginTop: 4,
          }}
        >
          {/* Connections panel button */}
          <View style={{ position: "relative", marginRight: isLandscape ? 6 : 8 }}>
            <TouchableOpacity
              onPress={onShowConnections}
              focusable={false}
              className="items-center justify-center"
              activeOpacity={0.7}
              style={{
                width: buttonSize,
                height: buttonSize,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: BORDER_COLORS.BUTTON,
                backgroundColor: BACKGROUNDS.BUTTON,
                borderRadius: RADIUS.BUTTON,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <Layers size={isLandscape ? 16 : 18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Back to hosts button */}
          <TouchableOpacity
            onPress={() => router.navigate("/hosts" as any)}
            focusable={false}
            className="items-center justify-center"
            activeOpacity={0.7}
            style={{
              width: buttonSize,
              height: buttonSize,
              borderWidth: StyleSheet.hairlineWidth,
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
                const SessionIcon = getSessionIcon(session.type);
                const iconColor = isActive ? ACCENT : TEXT_COLORS.SECONDARY;

                return (
                  <TouchableOpacity
                    key={session.id}
                    onPress={() => onTabPress(session.id)}
                    focusable={false}
                    className="flex-row items-center"
                    style={{
                      borderWidth: StyleSheet.hairlineWidth,
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
                      minWidth: isLandscape ? 90 : 110,
                      height: buttonSize,
                    }}
                  >
                    <View
                      className="flex-1 flex-row items-center gap-1.5 px-2"
                      style={{ height: buttonSize }}
                    >
                      <SessionIcon
                        size={isLandscape ? 12 : 13}
                        color={iconColor}
                        strokeWidth={2}
                      />
                      <Text
                        className="text-sm font-medium flex-1"
                        style={{ color: iconColor }}
                        numberOfLines={1}
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
                        width: isLandscape ? 28 : 32,
                        height: buttonSize,
                        borderLeftWidth: StyleSheet.hairlineWidth,
                        borderLeftColor: isActive
                          ? BORDER_COLORS.ACTIVE
                          : BORDER_COLORS.BUTTON,
                      }}
                    >
                      <X
                        size={isLandscape ? 13 : 14}
                        color={isActive ? TEXT_COLORS.PRIMARY : TEXT_COLORS.TERTIARY}
                        strokeWidth={2.5}
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
                borderWidth: StyleSheet.hairlineWidth,
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
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isCustomKeyboardVisible
                  ? BORDER_COLORS.ACTIVE
                  : BORDER_COLORS.BUTTON,
                backgroundColor: isCustomKeyboardVisible
                  ? `${ACCENT}18`
                  : BACKGROUNDS.BUTTON,
                borderRadius: RADIUS.BUTTON,
                elevation: 2,
                marginLeft: isLandscape ? 6 : 8,
              }}
            >
              {isCustomKeyboardVisible ? (
                <Minus size={isLandscape ? 18 : 20} color={ACCENT} />
              ) : (
                <Plus size={isLandscape ? 18 : 20} color="#ffffff" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
