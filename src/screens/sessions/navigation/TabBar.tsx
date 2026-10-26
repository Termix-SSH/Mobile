import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
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
  Layers,
} from "lucide-react-native";
import {
  SessionType,
  TerminalSession,
} from "@/contexts/TerminalSessionsContext";
import { useRouter } from "expo-router";
import { isSecondaryClick } from "@/ui/ContextMenu";
import { useOrientation } from "@/utils/orientation";
import { getTabBarHeight, getButtonSize } from "@/utils/responsive";
import { useUiColors } from "@/contexts/ThemeContext";
import { features } from "@/core/features";
import { displayTitle } from "@/contexts/session-tabs";
import { useSessionStatuses } from "@/core/sessions/status";
import { statusLabel, TabStatusMark } from "./TabStatusMark";
import DraggableFlatList, {
  ScaleDecorator,
} from "react-native-draggable-flatlist";

function getSessionIcon(type: SessionType) {
  return features.sessionTab(type)?.icon ?? SquareTerminal;
}

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
  const statuses = useSessionStatuses();
  const router = useRouter();
  const { isLandscape } = useOrientation();
  const insets = useSafeAreaInsets();

  const tabBarHeight = getTabBarHeight(isLandscape);
  const buttonSize = getButtonSize(isLandscape);

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

  return (
    <View style={{ position: "relative" }}>
      <View
        style={{
          backgroundColor: ui.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: ui.border,
          borderBottomWidth: 0,
          height: tabBarHeight + (needsBottomPadding ? insets.bottom : 0),
          paddingBottom: needsBottomPadding ? insets.bottom : 0,
          justifyContent: features.sessionHas(
            activeSessionType,
            "terminal-input",
          )
            ? "center"
            : "flex-start",
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
          <View
            style={{ position: "relative", marginRight: isLandscape ? 6 : 8 }}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Connections"
              onPress={onShowConnections}
              focusable={false}
              className="items-center justify-center"
              activeOpacity={0.7}
              style={{
                width: buttonSize,
                height: buttonSize,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: ui.border,
                backgroundColor: ui.muted,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <Layers size={isLandscape ? 16 : 18} color={ui.text} />
            </TouchableOpacity>
          </View>

          {/* Back to hosts button */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back to hosts"
            onPress={() => router.navigate("/hosts" as any)}
            focusable={false}
            className="items-center justify-center"
            activeOpacity={0.7}
            style={{
              width: buttonSize,
              height: buttonSize,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: ui.border,
              backgroundColor: ui.muted,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
              marginRight: isLandscape ? 6 : 8,
            }}
          >
            <ArrowLeft size={isLandscape ? 18 : 20} color={ui.text} />
          </TouchableOpacity>

          <View style={{ flex: 1, justifyContent: "center" }}>
            <DraggableFlatList
              horizontal
              data={sessions}
              keyExtractor={(session) => session.id}
              keyboardShouldPersistTaps="always"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, alignItems: "center" }}
              activationDistance={8}
              onDragEnd={({ data, from, to }) => {
                if (from !== to) onTabMove?.(data[to].id, to);
              }}
              renderItem={({ item: session, drag, isActive: dragging }) => {
                const isActive = session.id === activeSessionId;
                const SessionIcon = getSessionIcon(session.type);
                const iconColor = isActive ? ui.brand : ui.textMuted;
                const title = displayTitle(session);
                const status = statuses[session.id]?.state;
                const statusText = statusLabel(status);
                return (
                  <ScaleDecorator>
                    <TouchableOpacity
                      onPress={() =>
                        isActive && onTabMenu
                          ? onTabMenu(session.id)
                          : onTabPress(session.id)
                      }
                      onLongPress={drag}
                      delayLongPress={250}
                      disabled={dragging}
                      focusable={false}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={
                        statusText ? `${title}, ${statusText}` : title
                      }
                      accessibilityHint={
                        isActive
                          ? "Tap for tab options, hold to move"
                          : "Hold to move"
                      }
                      className="flex-row items-center"
                      style={{
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor:
                          isActive || dragging ? ui.brand : ui.border,
                        backgroundColor: dragging ? ui.muted : ui.card,
                        minWidth: isLandscape ? 90 : 110,
                        maxWidth: 220,
                        height: buttonSize,
                      }}
                    >
                      <View
                        className="flex-1 flex-row items-center gap-1.5 px-2"
                        style={{ height: buttonSize }}
                        onPointerDown={(e) => {
                          if (isSecondaryClick(e.nativeEvent)) {
                            onTabMenu?.(session.id);
                          }
                        }}
                      >
                        <SessionIcon
                          size={isLandscape ? 12 : 13}
                          color={iconColor}
                          strokeWidth={2}
                        />
                        <Text
                          className="flex-1 text-sm font-medium"
                          style={{ color: iconColor }}
                          numberOfLines={1}
                        >
                          {title}
                        </Text>
                        <TabStatusMark state={status} />
                      </View>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          onTabClose(session.id);
                        }}
                        focusable={false}
                        accessibilityRole="button"
                        accessibilityLabel={`Close ${title}`}
                        className="items-center justify-center"
                        activeOpacity={0.7}
                        style={{
                          width: isLandscape ? 28 : 32,
                          height: buttonSize,
                          borderLeftWidth: StyleSheet.hairlineWidth,
                          borderLeftColor: isActive ? ui.brand : ui.border,
                        }}
                      >
                        <X
                          size={isLandscape ? 13 : 14}
                          color={isActive ? ui.text : ui.textFaint}
                          strokeWidth={2.5}
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </ScaleDecorator>
                );
              }}
            />
          </View>

          {features.sessionHas(activeSessionType, "terminal-input") &&
            !isCustomKeyboardVisible && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  keyboardIntentionallyHiddenRef.current
                    ? "Show keyboard"
                    : "Hide keyboard"
                }
                onPress={handleToggleSystemKeyboard}
                focusable={false}
                className="items-center justify-center"
                activeOpacity={0.7}
                style={{
                  width: buttonSize,
                  height: buttonSize,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: ui.border,
                  backgroundColor: ui.muted,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  elevation: 2,
                  marginLeft: isLandscape ? 6 : 8,
                }}
              >
                {keyboardIntentionallyHiddenRef.current ? (
                  <ChevronUp size={isLandscape ? 18 : 20} color={ui.text} />
                ) : (
                  <ChevronDown size={isLandscape ? 18 : 20} color={ui.text} />
                )}
              </TouchableOpacity>
            )}

          {features.sessionHas(activeSessionType, "terminal-input") && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={
                isCustomKeyboardVisible ? "Hide keys panel" : "Show keys panel"
              }
              onPress={() => onToggleKeyboard?.()}
              focusable={false}
              className="items-center justify-center"
              activeOpacity={0.7}
              style={{
                width: buttonSize,
                height: buttonSize,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isCustomKeyboardVisible ? ui.brand : ui.border,
                backgroundColor: isCustomKeyboardVisible
                  ? `${ui.brand}18`
                  : ui.muted,
                elevation: 2,
                marginLeft: isLandscape ? 6 : 8,
              }}
            >
              {isCustomKeyboardVisible ? (
                <Minus size={isLandscape ? 18 : 20} color={ui.brand} />
              ) : (
                <Plus size={isLandscape ? 18 : 20} color={ui.text} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
